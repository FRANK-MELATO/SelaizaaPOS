const { query, getClient } = require('../config/db');
const { normalizePhone } = require('../utils/phone');

/**
 * Calculate loyalty tier
 */
const getLoyaltyTier = (points) => {
  if (points >= 5000) return 'Gold';
  if (points >= 1000) return 'Silver';
  return 'Bronze';
};

/**
 * GET /api/customers
 * List customers. Support ?search= (name/phone/email)
 */
const getCustomers = async (req, res, next) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    let whereClause = '';

    if (search) {
      params.push(`%${search}%`);
      whereClause = `WHERE c.name ILIKE $1 OR c.phone ILIKE $1 OR c.email ILIKE $1`;
    }

    const countResult = await query(
      `SELECT COUNT(*) FROM customers c ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit));
    params.push(offset);

    const result = await query(
      `SELECT c.id, c.name, c.email, c.phone, c.address,
              c.loyalty_points, c.loyalty_tier, c.total_spent, c.created_at
       FROM customers c
       ${whereClause}
       ORDER BY c.name
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      success: true,
      data: {
        customers: result.rows,
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
 * GET /api/customers/:id
 * Customer profile + recent purchases + loyalty transactions
 */
const getCustomerById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const custResult = await query(
      'SELECT * FROM customers WHERE id = $1',
      [id]
    );

    if (custResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

    const customer = custResult.rows[0];

    // Recent purchases (last 5)
    const recentSalesResult = await query(
      `SELECT s.id, s.sale_number, s.total, s.status, s.points_earned, s.created_at
       FROM sales s
       WHERE s.customer_id = $1 AND s.status = 'completed'
       ORDER BY s.created_at DESC
       LIMIT 5`,
      [id]
    );

    // Recent loyalty transactions (last 10)
    const loyaltyResult = await query(
      `SELECT lt.id, lt.points_change, lt.transaction_type, lt.notes, lt.created_at,
              s.sale_number AS reference_sale_number
       FROM loyalty_transactions lt
       LEFT JOIN sales s ON s.id = lt.reference_sale_id
       WHERE lt.customer_id = $1
       ORDER BY lt.created_at DESC
       LIMIT 10`,
      [id]
    );

    res.json({
      success: true,
      data: {
        ...customer,
        recent_purchases: recentSalesResult.rows,
        loyalty_transactions: loyaltyResult.rows,
        points_to_next_tier: customer.loyalty_tier === 'Bronze'
          ? Math.max(0, 1000 - customer.loyalty_points)
          : customer.loyalty_tier === 'Silver'
            ? Math.max(0, 5000 - customer.loyalty_points)
            : 0
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/customers
 */
const createCustomer = async (req, res, next) => {
  try {
    const { name, email, phone, address } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Customer name is required.' });
    }

    const normalizedPhone = phone ? normalizePhone(phone) : null;

    // Same person re-entered with the phone typed differently (with/without
    // "+266", spaces, etc.) is still the same customer — point the cashier
    // at the existing record instead of silently creating a duplicate.
    if (normalizedPhone) {
      const dupe = await query(
        `SELECT id, name FROM customers
         WHERE RIGHT(regexp_replace(phone, '\\D', '', 'g'), 8) = RIGHT($1, 8)`,
        [normalizedPhone]
      );
      if (dupe.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: `A customer with this phone number already exists: ${dupe.rows[0].name} (ID ${dupe.rows[0].id}). Edit that customer instead of creating a new one.`
        });
      }
    }

    const result = await query(
      `INSERT INTO customers (name, email, phone, address)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name.trim(), email ? email.toLowerCase().trim() : null, normalizedPhone, address || null]
    );

    res.status(201).json({
      success: true,
      message: 'Customer created.',
      data: result.rows[0]
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/customers/:id
 */
const updateCustomer = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, phone, address } = req.body;

    const existing = await query('SELECT id FROM customers WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

    if (phone) {
      const normalizedPhone = normalizePhone(phone);
      const dupe = await query(
        `SELECT id, name FROM customers
         WHERE RIGHT(regexp_replace(phone, '\\D', '', 'g'), 8) = RIGHT($1, 8) AND id != $2`,
        [normalizedPhone, id]
      );
      if (dupe.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: `That phone number already belongs to another customer: ${dupe.rows[0].name} (ID ${dupe.rows[0].id}).`
        });
      }
    }

    const fields = [];
    const values = [];
    let i = 1;

    if (name !== undefined)    { fields.push(`name = $${i++}`);    values.push(name.trim()); }
    if (email !== undefined)   { fields.push(`email = $${i++}`);   values.push(email ? email.toLowerCase().trim() : null); }
    if (phone !== undefined)   { fields.push(`phone = $${i++}`);   values.push(phone ? normalizePhone(phone) : null); }
    if (address !== undefined) { fields.push(`address = $${i++}`); values.push(address); }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await query(
      `UPDATE customers SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );

    res.json({ success: true, message: 'Customer updated.', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/customers/:id/loyalty
 */
const getLoyaltyInfo = async (req, res, next) => {
  try {
    const { id } = req.params;

    const custResult = await query(
      `SELECT id, name, loyalty_points, loyalty_tier, total_spent FROM customers WHERE id = $1`,
      [id]
    );

    if (custResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

    const customer = custResult.rows[0];

    const transactionsResult = await query(
      `SELECT lt.id, lt.points_change, lt.transaction_type, lt.notes, lt.created_at,
              s.sale_number
       FROM loyalty_transactions lt
       LEFT JOIN sales s ON s.id = lt.reference_sale_id
       WHERE lt.customer_id = $1
       ORDER BY lt.created_at DESC
       LIMIT 20`,
      [id]
    );

    const stats = await query(
      `SELECT
         SUM(CASE WHEN transaction_type = 'earn' THEN points_change ELSE 0 END) AS total_earned,
         SUM(CASE WHEN transaction_type = 'redeem' THEN ABS(points_change) ELSE 0 END) AS total_redeemed
       FROM loyalty_transactions
       WHERE customer_id = $1`,
      [id]
    );

    res.json({
      success: true,
      data: {
        customer_id: customer.id,
        name: customer.name,
        loyalty_points: customer.loyalty_points,
        loyalty_tier: customer.loyalty_tier,
        total_spent: customer.total_spent,
        points_value: (customer.loyalty_points / 100) * 10,
        points_to_next_tier: customer.loyalty_tier === 'Bronze'
          ? Math.max(0, 1000 - customer.loyalty_points)
          : customer.loyalty_tier === 'Silver'
            ? Math.max(0, 5000 - customer.loyalty_points)
            : 0,
        total_earned: parseInt(stats.rows[0].total_earned) || 0,
        total_redeemed: parseInt(stats.rows[0].total_redeemed) || 0,
        transactions: transactionsResult.rows
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/customers/:id/loyalty/adjust
 * Manual points adjustment (admin only)
 */
const adjustLoyaltyPoints = async (req, res, next) => {
  const client = await getClient();
  try {
    const { id } = req.params;
    const { points_change, notes } = req.body;

    if (points_change === undefined || points_change === null) {
      return res.status(400).json({ success: false, message: 'points_change is required.' });
    }

    if (!notes) {
      return res.status(400).json({ success: false, message: 'Notes are required for manual adjustments.' });
    }

    await client.query('BEGIN');

    const custResult = await client.query(
      'SELECT id, name, loyalty_points FROM customers WHERE id = $1',
      [id]
    );

    if (custResult.rows.length === 0) {
      throw Object.assign(new Error('Customer not found.'), { statusCode: 404 });
    }

    const customer = custResult.rows[0];
    const newPoints = customer.loyalty_points + parseInt(points_change);

    if (newPoints < 0) {
      throw Object.assign(
        new Error(`Cannot reduce points below zero. Current: ${customer.loyalty_points}`),
        { statusCode: 400 }
      );
    }

    const newTier = getLoyaltyTier(newPoints);

    await client.query(
      `UPDATE customers SET loyalty_points = $1, loyalty_tier = $2, updated_at = NOW() WHERE id = $3`,
      [newPoints, newTier, id]
    );

    await client.query(
      `INSERT INTO loyalty_transactions (customer_id, points_change, transaction_type, notes)
       VALUES ($1, $2, 'adjustment', $3)`,
      [id, parseInt(points_change), `Admin adjustment by ${req.user.name}: ${notes}`]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Loyalty points adjusted.',
      data: {
        customer: customer.name,
        previous_points: customer.loyalty_points,
        points_change: parseInt(points_change),
        new_points: newPoints,
        new_tier: newTier
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
 * GET /api/customers/:id/sales
 * Paginated purchase history
 */
const getCustomerSalesHistory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const custCheck = await query('SELECT id FROM customers WHERE id = $1', [id]);
    if (custCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

    const countResult = await query(
      `SELECT COUNT(*) FROM sales WHERE customer_id = $1 AND status != 'held'`,
      [id]
    );
    const total = parseInt(countResult.rows[0].count);

    const salesResult = await query(
      `SELECT s.id, s.sale_number, s.subtotal, s.discount_amount, s.tax_amount, s.total,
              s.points_earned, s.points_redeemed, s.status, s.created_at,
              u.name AS cashier_name
       FROM sales s
       JOIN users u ON u.id = s.cashier_id
       WHERE s.customer_id = $1 AND s.status != 'held'
       ORDER BY s.created_at DESC
       LIMIT $2 OFFSET $3`,
      [id, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: {
        sales: salesResult.rows,
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
 * DELETE /api/customers/:id
 * Remove a customer (admin only). Blocked if they have sales history.
 */
const deleteCustomer = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await query('SELECT id, name FROM customers WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

    const salesCheck = await query(
      `SELECT COUNT(*) FROM sales WHERE customer_id = $1 AND status = 'completed'`,
      [id]
    );
    const hasSales = parseInt(salesCheck.rows[0].count) > 0;

    if (hasSales) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete ${existing.rows[0].name} — they have completed sales history. Consider keeping the record for accountability.`
      });
    }

    await query('DELETE FROM customers WHERE id = $1', [id]);

    res.json({ success: true, message: 'Customer deleted.' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getLoyaltyInfo,
  adjustLoyaltyPoints,
  getCustomerSalesHistory
};
