const { query, getClient } = require('../config/db');

/**
 * GET /api/inventory
 * List all variants with stock levels. Filter: ?low_stock=true&search=
 */
const getInventory = async (req, res, next) => {
  try {
    const { low_stock, search, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const params = [];
    const conditions = ['p.is_active = true', 'pv.is_active = true'];

    if (low_stock === 'true') {
      conditions.push('i.quantity <= i.low_stock_threshold');
    }

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(p.name ILIKE $${params.length} OR pv.sku ILIKE $${params.length} OR pv.barcode ILIKE $${params.length})`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await query(
      `SELECT COUNT(*) FROM inventory i
       JOIN product_variants pv ON pv.id = i.variant_id
       JOIN products p ON p.id = pv.product_id
       ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit));
    params.push(offset);

    const result = await query(
      `SELECT i.id, i.quantity, i.low_stock_threshold, i.updated_at,
              pv.id AS variant_id, pv.sku, pv.barcode, pv.flavor, pv.size, pv.price, pv.cost_price,
              p.id AS product_id, p.name AS product_name,
              c.name AS category_name,
              (i.quantity <= i.low_stock_threshold) AS is_low_stock
       FROM inventory i
       JOIN product_variants pv ON pv.id = i.variant_id
       JOIN products p ON p.id = pv.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       ${whereClause}
       ORDER BY p.name, pv.size
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      success: true,
      data: {
        inventory: result.rows,
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
 * POST /api/inventory/adjust
 * Manual stock adjustment
 */
const adjustStock = async (req, res, next) => {
  const client = await getClient();
  try {
    const { variant_id, quantity_change, notes } = req.body;

    if (!variant_id || quantity_change === undefined || quantity_change === null) {
      return res.status(400).json({ success: false, message: 'variant_id and quantity_change are required.' });
    }

    if (!Number.isInteger(parseInt(quantity_change))) {
      return res.status(400).json({ success: false, message: 'quantity_change must be an integer.' });
    }

    await client.query('BEGIN');

    const invResult = await client.query(
      `SELECT i.quantity, pv.sku, p.name AS product_name
       FROM inventory i
       JOIN product_variants pv ON pv.id = i.variant_id
       JOIN products p ON p.id = pv.product_id
       WHERE i.variant_id = $1`,
      [variant_id]
    );

    if (invResult.rows.length === 0) {
      throw Object.assign(new Error('Inventory record not found for this variant.'), { statusCode: 404 });
    }

    const currentQty = invResult.rows[0].quantity;
    const newQty = currentQty + parseInt(quantity_change);

    if (newQty < 0) {
      throw Object.assign(
        new Error(`Cannot adjust stock below zero. Current: ${currentQty}, Change: ${quantity_change}`),
        { statusCode: 400 }
      );
    }

    await client.query(
      'UPDATE inventory SET quantity = $1, updated_at = NOW() WHERE variant_id = $2',
      [newQty, variant_id]
    );

    await client.query(
      `INSERT INTO inventory_history (variant_id, change_type, quantity_change, quantity_after, notes, created_by)
       VALUES ($1, 'adjustment', $2, $3, $4, $5)`,
      [variant_id, parseInt(quantity_change), newQty, notes || 'Manual adjustment', req.user.id]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Stock adjusted successfully.',
      data: {
        variant_id: parseInt(variant_id),
        product: invResult.rows[0].product_name,
        sku: invResult.rows[0].sku,
        previous_quantity: currentQty,
        quantity_change: parseInt(quantity_change),
        new_quantity: newQty
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * POST /api/inventory/write-off
 * Write off damaged or expired stock
 */
const writeOff = async (req, res, next) => {
  const client = await getClient();
  try {
    const { variant_id, quantity, reason } = req.body;

    if (!variant_id || !quantity || quantity <= 0) {
      return res.status(400).json({ success: false, message: 'variant_id and a positive quantity are required.' });
    }

    if (!reason) {
      return res.status(400).json({ success: false, message: 'A reason for write-off is required.' });
    }

    await client.query('BEGIN');

    const invResult = await client.query(
      `SELECT i.quantity, pv.sku, p.name AS product_name
       FROM inventory i
       JOIN product_variants pv ON pv.id = i.variant_id
       JOIN products p ON p.id = pv.product_id
       WHERE i.variant_id = $1`,
      [variant_id]
    );

    if (invResult.rows.length === 0) {
      throw Object.assign(new Error('Inventory record not found.'), { statusCode: 404 });
    }

    const currentQty = invResult.rows[0].quantity;
    const writeOffQty = parseInt(quantity);

    if (writeOffQty > currentQty) {
      throw Object.assign(
        new Error(`Cannot write off more than available stock (${currentQty}).`),
        { statusCode: 400 }
      );
    }

    const newQty = currentQty - writeOffQty;

    await client.query(
      'UPDATE inventory SET quantity = $1, updated_at = NOW() WHERE variant_id = $2',
      [newQty, variant_id]
    );

    await client.query(
      `INSERT INTO inventory_history (variant_id, change_type, quantity_change, quantity_after, notes, created_by)
       VALUES ($1, 'write_off', $2, $3, $4, $5)`,
      [variant_id, -writeOffQty, newQty, `Write-off: ${reason}`, req.user.id]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Stock written off.',
      data: {
        product: invResult.rows[0].product_name,
        sku: invResult.rows[0].sku,
        written_off: writeOffQty,
        previous_quantity: currentQty,
        new_quantity: newQty,
        reason
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * GET /api/inventory/history
 * Stock movement log with filters
 */
const getInventoryHistory = async (req, res, next) => {
  try {
    const {
      variant_id, change_type, start_date, end_date,
      page = 1, limit = 50
    } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const params = [];
    const conditions = [];

    if (variant_id) {
      params.push(parseInt(variant_id));
      conditions.push(`ih.variant_id = $${params.length}`);
    }
    if (change_type) {
      params.push(change_type);
      conditions.push(`ih.change_type = $${params.length}`);
    }
    if (start_date) {
      params.push(start_date);
      conditions.push(`ih.created_at >= $${params.length}::date`);
    }
    if (end_date) {
      params.push(end_date);
      conditions.push(`ih.created_at < ($${params.length}::date + INTERVAL '1 day')`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*) FROM inventory_history ih ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit));
    params.push(offset);

    const result = await query(
      `SELECT ih.*,
              p.name AS product_name, pv.sku, pv.size, pv.flavor,
              u.name AS created_by_name
       FROM inventory_history ih
       JOIN product_variants pv ON pv.id = ih.variant_id
       JOIN products p ON p.id = pv.product_id
       LEFT JOIN users u ON u.id = ih.created_by
       ${whereClause}
       ORDER BY ih.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      success: true,
      data: {
        history: result.rows,
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
 * GET /api/inventory/low-stock
 * Variants where quantity <= low_stock_threshold
 */
const getLowStockAlerts = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT i.quantity, i.low_stock_threshold,
              pv.id AS variant_id, pv.sku, pv.barcode, pv.size, pv.flavor,
              p.id AS product_id, p.name AS product_name,
              c.name AS category_name,
              (i.low_stock_threshold - i.quantity) AS units_needed
       FROM inventory i
       JOIN product_variants pv ON pv.id = i.variant_id
       JOIN products p ON p.id = pv.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE i.quantity <= i.low_stock_threshold
         AND pv.is_active = true
         AND p.is_active = true
       ORDER BY i.quantity ASC, p.name`
    );

    res.json({
      success: true,
      data: {
        count: result.rows.length,
        alerts: result.rows
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/inventory/valuation
 * Sum of (quantity * cost_price) per product
 */
const getInventoryValuation = async (req, res, next) => {
  try {
    const byProductResult = await query(
      `SELECT p.id AS product_id, p.name AS product_name,
              c.name AS category_name,
              SUM(i.quantity) AS total_units,
              SUM(i.quantity * COALESCE(pv.cost_price, 0)) AS total_cost_value,
              SUM(i.quantity * pv.price) AS total_retail_value
       FROM inventory i
       JOIN product_variants pv ON pv.id = i.variant_id
       JOIN products p ON p.id = pv.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.is_active = true AND pv.is_active = true
       GROUP BY p.id, p.name, c.name
       ORDER BY total_cost_value DESC`
    );

    const totalsResult = await query(
      `SELECT
         SUM(i.quantity) AS total_units,
         SUM(i.quantity * COALESCE(pv.cost_price, 0)) AS total_cost_value,
         SUM(i.quantity * pv.price) AS total_retail_value,
         SUM(i.quantity * (pv.price - COALESCE(pv.cost_price, 0))) AS potential_profit
       FROM inventory i
       JOIN product_variants pv ON pv.id = i.variant_id
       JOIN products p ON p.id = pv.product_id
       WHERE p.is_active = true AND pv.is_active = true`
    );

    res.json({
      success: true,
      data: {
        summary: totalsResult.rows[0],
        by_product: byProductResult.rows
      }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getInventory,
  adjustStock,
  writeOff,
  getInventoryHistory,
  getLowStockAlerts,
  getInventoryValuation
};
