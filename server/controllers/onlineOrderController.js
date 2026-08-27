const { query, getClient } = require('../config/db');
const { normalizePhone } = require('../utils/phone');

/**
 * Generate online order number: ONL-YYYYMMDD-NNNN
 */
const generateOrderNumber = async (client) => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `ONL-${dateStr}-`;

  const result = await client.query(
    `SELECT COUNT(*) FROM online_orders WHERE order_number LIKE $1`,
    [`${prefix}%`]
  );
  const seq = parseInt(result.rows[0].count) + 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
};

/**
 * GET /api/online/products
 * Public product catalog (no auth required)
 */
const getPublicProducts = async (req, res, next) => {
  try {
    const { search, category_id } = req.query;
    const params = [];
    let whereClause = 'WHERE p.is_active = true AND pv.is_active = true';

    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (p.name ILIKE $${params.length} OR p.description ILIKE $${params.length})`;
    }

    if (category_id) {
      params.push(parseInt(category_id));
      whereClause += ` AND p.category_id = $${params.length}`;
    }

    const productsResult = await query(
      `SELECT DISTINCT p.id, p.name, p.description, p.image_url,
              c.id AS category_id, c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       JOIN product_variants pv ON pv.product_id = p.id
       ${whereClause}
       ORDER BY p.name`,
      params
    );

    if (productsResult.rows.length === 0) {
      return res.json({ success: true, data: { products: [], categories: [] } });
    }

    const productIds = productsResult.rows.map(p => p.id);

    const variantsResult = await query(
      `SELECT pv.id, pv.product_id, pv.sku, pv.size, pv.flavor, pv.price,
              i.quantity AS stock_quantity
       FROM product_variants pv
       LEFT JOIN inventory i ON i.variant_id = pv.id
       WHERE pv.product_id = ANY($1) AND pv.is_active = true
         AND COALESCE(i.quantity, 0) > 0
       ORDER BY pv.price`,
      [productIds]
    );

    const categoriesResult = await query(
      `SELECT id, name FROM categories ORDER BY name`
    );

    const variantsByProduct = {};
    variantsResult.rows.forEach(v => {
      if (!variantsByProduct[v.product_id]) variantsByProduct[v.product_id] = [];
      variantsByProduct[v.product_id].push(v);
    });

    const products = productsResult.rows
      .map(p => ({
        ...p,
        variants: variantsByProduct[p.id] || []
      }))
      .filter(p => p.variants.length > 0);

    res.json({
      success: true,
      data: { products, categories: categoriesResult.rows }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/online/orders
 * Customer places an order (no auth required)
 */
const placeOrder = async (req, res, next) => {
  const client = await getClient();
  try {
    const {
      customer_name, customer_email, customer_phone,
      delivery_address, items = [], payment_method, notes,
      delivery_fee = 0
    } = req.body;

    if (!customer_name || !customer_phone) {
      return res.status(400).json({
        success: false,
        message: 'Customer name and phone number are required.'
      });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Order must have at least one item.' });
    }

    await client.query('BEGIN');

    // Validate items and check stock
    let subtotal = 0;
    const processedItems = [];

    for (const item of items) {
      if (!item.variant_id || !item.quantity || item.quantity < 1) {
        throw Object.assign(new Error('Each item requires variant_id and a positive quantity.'), { statusCode: 400 });
      }

      const varResult = await client.query(
        `SELECT pv.id, pv.price, p.name AS product_name, pv.size, pv.flavor,
                i.quantity AS stock_available
         FROM product_variants pv
         JOIN products p ON p.id = pv.product_id
         LEFT JOIN inventory i ON i.variant_id = pv.id
         WHERE pv.id = $1 AND pv.is_active = true AND p.is_active = true`,
        [item.variant_id]
      );

      if (varResult.rows.length === 0) {
        throw Object.assign(new Error(`Product variant ${item.variant_id} not found.`), { statusCode: 400 });
      }

      const variant = varResult.rows[0];
      const qty = parseInt(item.quantity);

      if (variant.stock_available < qty) {
        throw Object.assign(
          new Error(`Insufficient stock for ${variant.product_name} ${variant.size}. Available: ${variant.stock_available}`),
          { statusCode: 400 }
        );
      }

      const unitPrice = parseFloat(item.unit_price || variant.price);
      const totalPrice = unitPrice * qty;
      subtotal += totalPrice;

      processedItems.push({
        variant_id: item.variant_id,
        quantity: qty,
        unit_price: unitPrice,
        total_price: totalPrice
      });
    }

    const total = subtotal + parseFloat(delivery_fee);
    const orderNumber = await generateOrderNumber(client);

    const orderResult = await client.query(
      `INSERT INTO online_orders (
         order_number, customer_name, customer_email, customer_phone,
         delivery_address, subtotal, delivery_fee, total,
         payment_method, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        orderNumber, customer_name.trim(), customer_email || null, customer_phone.trim(),
        delivery_address || null, subtotal.toFixed(2), parseFloat(delivery_fee).toFixed(2), total.toFixed(2),
        payment_method || null, notes || null
      ]
    );
    const order = orderResult.rows[0];

    for (const item of processedItems) {
      await client.query(
        `INSERT INTO online_order_items (order_id, variant_id, quantity, unit_price, total_price)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, item.variant_id, item.quantity, item.unit_price, item.total_price]
      );
    }

    // Auto-register or update customer from checkout details.
    // Match by phone number regardless of formatting (+266 prefix, spaces,
    // etc.) so the same person placing repeat orders lands on one customer
    // record instead of spawning a near-duplicate every time they type
    // their number slightly differently.
    try {
      const normalizedPhone = normalizePhone(customer_phone);
      const existingCustomer = await client.query(
        `SELECT id FROM customers
         WHERE RIGHT(regexp_replace(phone, '\\D', '', 'g'), 8) = RIGHT($1, 8)`,
        [normalizedPhone]
      );
      if (existingCustomer.rows.length === 0) {
        // If an email is provided, check it isn't already taken by a different account
        // (customers.email has a UNIQUE constraint; a conflict would silently kill the insert)
        let emailToUse = customer_email ? customer_email.trim() : null;
        if (emailToUse) {
          const emailConflict = await client.query(
            'SELECT id FROM customers WHERE email = $1',
            [emailToUse]
          );
          if (emailConflict.rows.length > 0) emailToUse = null;
        }
        await client.query(
          `INSERT INTO customers (name, phone, email, address)
           VALUES ($1, $2, $3, $4)`,
          [customer_name.trim(), normalizedPhone, emailToUse, delivery_address || null]
        );
      } else if (delivery_address) {
        await client.query(
          'UPDATE customers SET address = $1, updated_at = NOW() WHERE id = $2',
          [delivery_address, existingCustomer.rows[0].id]
        );
      }
    } catch (_) {
      // Non-fatal: if customer upsert fails the order still goes through
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Order placed successfully. We will contact you to confirm.',
      data: {
        order_number: orderNumber,
        id: order.id,
        total: parseFloat(order.total),
        status: order.status,
        customer_name: customer_name.trim(),
        customer_phone: customer_phone.trim()
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
 * GET /api/online/orders
 * Admin list of all online orders with filters
 */
const getOrders = async (req, res, next) => {
  try {
    const { status, payment_status, start_date, end_date, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const conditions = [];

    if (status) {
      params.push(status);
      conditions.push(`o.status = $${params.length}`);
    }
    if (payment_status) {
      params.push(payment_status);
      conditions.push(`o.payment_status = $${params.length}`);
    }
    if (start_date) {
      params.push(start_date);
      conditions.push(`o.created_at >= $${params.length}::date`);
    }
    if (end_date) {
      params.push(end_date);
      conditions.push(`o.created_at < ($${params.length}::date + INTERVAL '1 day')`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*) FROM online_orders o ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit));
    params.push(offset);

    const result = await query(
      `SELECT o.id, o.order_number, o.customer_name, o.customer_phone, o.total, o.status, o.payment_status, o.created_at,
              COUNT(oi.id)::int AS items_count
       FROM online_orders o
       LEFT JOIN online_order_items oi ON oi.order_id = o.id
       ${whereClause}
       GROUP BY o.id
       ORDER BY o.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      success: true,
      data: {
        orders: result.rows,
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
 * GET /api/online/orders/:id
 */
const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const orderResult = await query(
      'SELECT * FROM online_orders WHERE id = $1',
      [id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const itemsResult = await query(
      `SELECT oi.quantity, oi.unit_price, oi.total_price,
              pv.sku, pv.size, pv.flavor,
              p.name AS product_name, p.image_url
       FROM online_order_items oi
       JOIN product_variants pv ON pv.id = oi.variant_id
       JOIN products p ON p.id = pv.product_id
       WHERE oi.order_id = $1`,
      [id]
    );

    res.json({
      success: true,
      data: { ...orderResult.rows[0], items: itemsResult.rows }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/online/orders/:id/status
 */
const updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, payment_status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const existing = await query(
      'SELECT id, status, order_number, customer_phone, total FROM online_orders WHERE id = $1',
      [id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const prevStatus = existing.rows[0].status;

    const fields = [];
    const values = [];
    let i = 1;

    if (status)         { fields.push(`status = $${i++}`);         values.push(status); }
    if (payment_status) { fields.push(`payment_status = $${i++}`); values.push(payment_status); }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await query(
      `UPDATE online_orders SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );

    // When an order reaches delivered for the first time, credit the customer
    if (status === 'delivered' && prevStatus !== 'delivered') {
      const { customer_phone, total, order_number } = existing.rows[0];
      const orderTotal = parseFloat(total) || 0;
      if (customer_phone && orderTotal > 0) {
        try {
          const cust = await query(
            'SELECT id, loyalty_points, total_spent FROM customers WHERE TRIM(phone) = TRIM($1)',
            [customer_phone]
          );
          if (cust.rows.length > 0) {
            const c = cust.rows[0];
            const newPoints = parseInt(c.loyalty_points || 0) + Math.floor(orderTotal);
            const newSpent  = parseFloat(c.total_spent  || 0) + orderTotal;
            const newTier   = newPoints >= 5000 ? 'Gold' : newPoints >= 1000 ? 'Silver' : 'Bronze';
            await query(
              `UPDATE customers SET loyalty_points = $1, total_spent = $2, loyalty_tier = $3, updated_at = NOW() WHERE id = $4`,
              [newPoints, newSpent.toFixed(2), newTier, c.id]
            );
            await query(
              `INSERT INTO loyalty_transactions (customer_id, points_change, transaction_type, notes)
               VALUES ($1, $2, 'earn', $3)`,
              [c.id, Math.floor(orderTotal), `Online order #${order_number} delivered`]
            );
          }
        } catch (_) { /* non-fatal */ }
      }
    }

    res.json({ success: true, message: 'Order status updated.', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/online/orders/:id/cancel
 */
const cancelOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const existing = await query('SELECT id, status FROM online_orders WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const order = existing.rows[0];

    if (['delivered', 'cancelled'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel an order with status: ${order.status}`
      });
    }

    await query(
      `UPDATE online_orders
       SET status = 'cancelled',
           notes = COALESCE(notes || ' | ', '') || $1,
           updated_at = NOW()
       WHERE id = $2`,
      [`Cancelled: ${reason || 'No reason provided'}`, id]
    );

    res.json({ success: true, message: 'Order cancelled.' });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/online/orders/track?order_number=XXX&phone=XXX
 * Public tracking — no auth, customer identifies with order number + phone
 */
const trackOrder = async (req, res, next) => {
  try {
    const { order_number, phone } = req.query;
    if (!order_number || !phone) {
      return res.status(400).json({ success: false, message: 'order_number and phone are required.' });
    }

    // Match order number case-insensitively and compare phone numbers by
    // their last 8 digits so formatting differences (spaces, a leading
    // "+266"/"266"/"0", dashes) between what the customer typed at checkout
    // and what they type here don't produce a false "not found".
    const normalizedPhone = normalizePhone(phone);
    const result = await query(
      `SELECT id, order_number, status, payment_status, customer_name, customer_phone,
              subtotal, delivery_fee, total, notes, created_at, updated_at
       FROM online_orders
       WHERE UPPER(order_number) = UPPER($1)
         AND RIGHT(regexp_replace(customer_phone, '\\D', '', 'g'), 8) = RIGHT($2, 8)`,
      [order_number.trim(), normalizedPhone]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found. Check your order number and phone number.' });
    }

    const order = result.rows[0];

    const itemsResult = await query(
      `SELECT oi.quantity, oi.unit_price, oi.total_price,
              pv.size, pv.flavor, p.name AS product_name
       FROM online_order_items oi
       JOIN product_variants pv ON pv.id = oi.variant_id
       JOIN products p ON p.id = pv.product_id
       WHERE oi.order_id = $1`,
      [order.id]
    );

    res.json({
      success: true,
      data: { ...order, items: itemsResult.rows }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getPublicProducts,
  placeOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
  trackOrder
};
