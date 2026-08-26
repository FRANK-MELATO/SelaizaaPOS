const { query, getClient } = require('../config/db');
const path = require('path');
const fs = require('fs');

/**
 * GET /api/products
 * List all active products with variants and inventory. Supports ?search=&category_id=&page=&limit=
 */
const getProducts = async (req, res, next) => {
  try {
    const { search, category_id, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    let whereClause = 'WHERE p.is_active = true';

    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (p.name ILIKE $${params.length} OR p.description ILIKE $${params.length})`;
    }

    if (category_id) {
      params.push(parseInt(category_id));
      whereClause += ` AND p.category_id = $${params.length}`;
    }

    // Count total
    const countResult = await query(
      `SELECT COUNT(*) FROM products p ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit));
    params.push(offset);

    const productsResult = await query(
      `SELECT p.id, p.name, p.description, p.image_url, p.is_active, p.created_at,
              c.id AS category_id, c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       ${whereClause}
       ORDER BY p.name
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    if (productsResult.rows.length === 0) {
      return res.json({
        success: true,
        data: { products: [], total, page: parseInt(page), limit: parseInt(limit) }
      });
    }

    const productIds = productsResult.rows.map(p => p.id);
    const variantsResult = await query(
      `SELECT pv.id, pv.product_id, pv.sku, pv.barcode, pv.flavor, pv.size,
              pv.price, pv.cost_price, pv.is_active,
              i.quantity, i.low_stock_threshold
       FROM product_variants pv
       LEFT JOIN inventory i ON i.variant_id = pv.id
       WHERE pv.product_id = ANY($1) AND pv.is_active = true
       ORDER BY pv.size`,
      [productIds]
    );

    const variantsByProduct = {};
    variantsResult.rows.forEach(v => {
      if (!variantsByProduct[v.product_id]) variantsByProduct[v.product_id] = [];
      variantsByProduct[v.product_id].push(v);
    });

    const products = productsResult.rows.map(p => ({
      ...p,
      variants: variantsByProduct[p.id] || []
    }));

    res.json({
      success: true,
      data: {
        products,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/products/:id
 */
const getProductById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const productResult = await query(
      `SELECT p.id, p.name, p.description, p.image_url, p.is_active, p.created_at, p.updated_at,
              c.id AS category_id, c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = $1`,
      [id]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    const variantsResult = await query(
      `SELECT pv.id, pv.sku, pv.barcode, pv.flavor, pv.size, pv.price, pv.cost_price, pv.is_active,
              i.quantity, i.low_stock_threshold
       FROM product_variants pv
       LEFT JOIN inventory i ON i.variant_id = pv.id
       WHERE pv.product_id = $1
       ORDER BY pv.size`,
      [id]
    );

    res.json({
      success: true,
      data: { ...productResult.rows[0], variants: variantsResult.rows }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/products
 * Create product + variants + initialize inventory
 */
const createProduct = async (req, res, next) => {
  const client = await getClient();
  try {
    const { name, description, category_id, variants = [] } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Product name is required.' });
    }

    await client.query('BEGIN');

    let imageUrl = null;
    if (req.file) {
      imageUrl = `/uploads/products/${req.file.filename}`;
    }

    const productResult = await client.query(
      `INSERT INTO products (name, description, category_id, image_url)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, description || null, category_id || null, imageUrl]
    );
    const product = productResult.rows[0];

    const createdVariants = [];
    for (const v of variants) {
      const price = v.price || v.unit_price;
      if (!price) {
        throw Object.assign(new Error('Each variant requires a price.'), { statusCode: 400 });
      }
      if (!v.sku) {
        v.sku = `SLA-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
      }
      const varResult = await client.query(
        `INSERT INTO product_variants (product_id, sku, barcode, flavor, size, price, cost_price)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [product.id, v.sku, v.barcode || null, v.flavor || null, v.size || null,
         parseFloat(price), v.cost_price ? parseFloat(v.cost_price) : null]
      );
      const variant = varResult.rows[0];

      const invResult = await client.query(
        `INSERT INTO inventory (variant_id, quantity, low_stock_threshold)
         VALUES ($1, $2, $3) RETURNING *`,
        [variant.id, parseInt(v.initial_stock || v.stock_quantity) || 0, parseInt(v.low_stock_threshold) || 10]
      );

      createdVariants.push({ ...variant, inventory: invResult.rows[0] });
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Product created successfully.',
      data: { ...product, variants: createdVariants }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * PUT /api/products/:id
 */
const updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, category_id, is_active } = req.body;

    const existing = await query('SELECT id FROM products WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    let imageUrl = undefined;
    if (req.file) {
      imageUrl = `/uploads/products/${req.file.filename}`;
    }

    const fields = [];
    const values = [];
    let i = 1;

    if (name !== undefined) { fields.push(`name = $${i++}`); values.push(name); }
    if (description !== undefined) { fields.push(`description = $${i++}`); values.push(description); }
    if (category_id !== undefined) { fields.push(`category_id = $${i++}`); values.push(category_id || null); }
    if (is_active !== undefined) { fields.push(`is_active = $${i++}`); values.push(Boolean(is_active)); }
    if (imageUrl !== undefined) { fields.push(`image_url = $${i++}`); values.push(imageUrl); }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await query(
      `UPDATE products SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );

    res.json({ success: true, message: 'Product updated.', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/products/:id - Soft delete
 */
const deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(
      'UPDATE products SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    res.json({ success: true, message: 'Product deactivated.' });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/products/:id/variants
 */
const addVariant = async (req, res, next) => {
  const client = await getClient();
  try {
    const { id } = req.params;
    const { sku, barcode, flavor, size, cost_price, initial_stock, low_stock_threshold = 10, stock_quantity } = req.body;
    const price = req.body.price || req.body.unit_price;

    if (!price) {
      return res.status(400).json({ success: false, message: 'Price is required.' });
    }

    const productCheck = await query('SELECT id FROM products WHERE id = $1', [id]);
    if (productCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    await client.query('BEGIN');

    const varResult = await client.query(
      `INSERT INTO product_variants (product_id, sku, barcode, flavor, size, price, cost_price)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, sku, barcode || null, flavor || null, size || null,
       parseFloat(price), cost_price ? parseFloat(cost_price) : null]
    );
    const variant = varResult.rows[0];

    const invResult = await client.query(
      `INSERT INTO inventory (variant_id, quantity, low_stock_threshold)
       VALUES ($1, $2, $3) RETURNING *`,
      [variant.id, parseInt(initial_stock || stock_quantity) || 0, parseInt(low_stock_threshold)]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Variant added.',
      data: { ...variant, inventory: invResult.rows[0] }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * PUT /api/products/variants/:id
 */
const updateVariant = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { sku, barcode, flavor, size, cost_price, is_active } = req.body;
    const price = req.body.price !== undefined ? req.body.price : req.body.unit_price;

    const existing = await query('SELECT id FROM product_variants WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Variant not found.' });
    }

    const fields = [];
    const values = [];
    let i = 1;

    if (sku !== undefined)        { fields.push(`sku = $${i++}`);         values.push(sku); }
    if (barcode !== undefined)    { fields.push(`barcode = $${i++}`);     values.push(barcode); }
    if (flavor !== undefined)     { fields.push(`flavor = $${i++}`);      values.push(flavor); }
    if (size !== undefined)       { fields.push(`size = $${i++}`);        values.push(size); }
    if (price !== undefined)      { fields.push(`price = $${i++}`);       values.push(parseFloat(price)); }
    if (cost_price !== undefined) { fields.push(`cost_price = $${i++}`);  values.push(parseFloat(cost_price)); }
    if (is_active !== undefined)  { fields.push(`is_active = $${i++}`);   values.push(Boolean(is_active)); }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await query(
      `UPDATE product_variants SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );

    res.json({ success: true, message: 'Variant updated.', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/products/variants/:id - Soft delete
 */
const deleteVariant = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(
      'UPDATE product_variants SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Variant not found.' });
    }

    res.json({ success: true, message: 'Variant deactivated.' });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/products/barcode/:barcode
 */
const searchByBarcode = async (req, res, next) => {
  try {
    const { barcode } = req.params;

    const result = await query(
      `SELECT pv.id AS variant_id, pv.sku, pv.barcode, pv.flavor, pv.size, pv.price, pv.cost_price,
              p.id AS product_id, p.name AS product_name, p.description, p.image_url,
              c.name AS category_name,
              i.quantity, i.low_stock_threshold
       FROM product_variants pv
       JOIN products p ON p.id = pv.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN inventory i ON i.variant_id = pv.id
       WHERE pv.barcode = $1 AND pv.is_active = true AND p.is_active = true`,
      [barcode]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No product found with this barcode.' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/categories
 */
const getCategories = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT c.id, c.name, c.description, c.created_at,
              COUNT(p.id) AS product_count
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id AND p.is_active = true
       GROUP BY c.id
       ORDER BY c.name`
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/categories
 */
const createCategory = async (req, res, next) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Category name is required.' });
    }

    const result = await query(
      'INSERT INTO categories (name, description) VALUES ($1, $2) RETURNING *',
      [name.trim(), description || null]
    );

    res.status(201).json({ success: true, message: 'Category created.', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  addVariant,
  updateVariant,
  deleteVariant,
  searchByBarcode,
  getCategories,
  createCategory
};
