const { query, getClient } = require('../config/db');

/**
 * Generate sale number: S-YYYYMMDD-NNNN
 */
const generateSaleNumber = async (client) => {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `S-${dateStr}-`;

  const result = await client.query(
    `SELECT COUNT(*) FROM sales WHERE sale_number LIKE $1`,
    [`${prefix}%`]
  );
  const seq = parseInt(result.rows[0].count) + 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
};

/**
 * Calculate loyalty tier based on points
 */
const getLoyaltyTier = (points) => {
  if (points >= 5000) return 'Gold';
  if (points >= 1000) return 'Silver';
  return 'Bronze';
};

/**
 * POST /api/sales
 * Create a complete sale transaction
 */
const createSale = async (req, res, next) => {
  const client = await getClient();
  try {
    const {
      customer_id,
      items,
      discount_type,
      discount_value = 0,
      payments = [],
      points_redeemed = 0,
      tax_rate = 0, // VAT removed
      notes
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Sale must have at least one item.' });
    }

    if (!payments || payments.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one payment method is required.' });
    }

    await client.query('BEGIN');

    // Validate stock for all items
    for (const item of items) {
      const stockResult = await client.query(
        `SELECT pv.id, pv.sku, pv.price, p.name AS product_name,
                i.quantity
         FROM product_variants pv
         JOIN products p ON p.id = pv.product_id
         LEFT JOIN inventory i ON i.variant_id = pv.id
         WHERE pv.id = $1 AND pv.is_active = true AND p.is_active = true`,
        [item.variant_id]
      );

      if (stockResult.rows.length === 0) {
        throw Object.assign(
          new Error(`Variant ID ${item.variant_id} not found or inactive.`),
          { statusCode: 400 }
        );
      }

      const variant = stockResult.rows[0];
      if (variant.quantity < item.quantity) {
        throw Object.assign(
          new Error(`Insufficient stock for ${variant.product_name} (${variant.sku}). Available: ${variant.quantity}, Requested: ${item.quantity}`),
          { statusCode: 400 }
        );
      }
    }

    // Calculate subtotal
    let subtotal = 0;
    const processedItems = items.map(item => {
      const unitPrice = parseFloat(item.unit_price);
      const qty = parseInt(item.quantity);
      const itemDiscount = parseFloat(item.discount_amount || 0);
      const totalPrice = (unitPrice * qty) - itemDiscount;
      subtotal += totalPrice;
      return { ...item, unit_price: unitPrice, quantity: qty, discount_amount: itemDiscount, total_price: totalPrice };
    });

    // Calculate discount
    let discountAmount = 0;
    if (discount_type === 'percentage' && discount_value > 0) {
      discountAmount = (subtotal * parseFloat(discount_value)) / 100;
    } else if (discount_type === 'fixed' && discount_value > 0) {
      discountAmount = parseFloat(discount_value);
    }

    // Points redemption: 100 points = R10
    let pointsRedeemedValue = 0;
    let validPointsRedeemed = parseInt(points_redeemed) || 0;

    if (validPointsRedeemed > 0 && customer_id) {
      const custResult = await client.query(
        'SELECT loyalty_points FROM customers WHERE id = $1',
        [customer_id]
      );
      if (custResult.rows.length === 0) {
        throw Object.assign(new Error('Customer not found.'), { statusCode: 400 });
      }
      const availablePoints = custResult.rows[0].loyalty_points;
      validPointsRedeemed = Math.min(validPointsRedeemed, availablePoints);
      // Round down to nearest 100
      validPointsRedeemed = Math.floor(validPointsRedeemed / 100) * 100;
      pointsRedeemedValue = (validPointsRedeemed / 100) * 10;
    }

    const afterDiscount = subtotal - discountAmount - pointsRedeemedValue;
    const taxableAmount = Math.max(0, afterDiscount);
    const taxAmount = (taxableAmount * parseFloat(tax_rate)) / 100;
    const total = taxableAmount + taxAmount;

    // Validate total payments
    const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    if (Math.abs(totalPaid - total) > 0.01) {
      throw Object.assign(
        new Error(`Payment amount (R${totalPaid.toFixed(2)}) does not match total (R${total.toFixed(2)})`),
        { statusCode: 400 }
      );
    }

    // Generate sale number
    const saleNumber = await generateSaleNumber(client);

    // Create sale
    const saleResult = await client.query(
      `INSERT INTO sales (
        sale_number, customer_id, cashier_id, subtotal,
        discount_type, discount_value, discount_amount,
        tax_rate, tax_amount, total,
        points_redeemed, points_redeemed_value,
        status, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'completed',$13)
       RETURNING *`,
      [
        saleNumber, customer_id || null, req.user.id, subtotal.toFixed(2),
        discount_type || null, parseFloat(discount_value) || 0, discountAmount.toFixed(2),
        parseFloat(tax_rate), taxAmount.toFixed(2), total.toFixed(2),
        validPointsRedeemed, pointsRedeemedValue.toFixed(2),
        notes || null
      ]
    );
    const sale = saleResult.rows[0];

    // Insert sale items and deduct inventory
    for (const item of processedItems) {
      await client.query(
        `INSERT INTO sale_items (sale_id, variant_id, quantity, unit_price, discount_amount, total_price)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [sale.id, item.variant_id, item.quantity, item.unit_price, item.discount_amount, item.total_price]
      );

      // Deduct from inventory
      const invResult = await client.query(
        `UPDATE inventory SET quantity = quantity - $1, updated_at = NOW()
         WHERE variant_id = $2 RETURNING quantity`,
        [item.quantity, item.variant_id]
      );

      // Log inventory change
      await client.query(
        `INSERT INTO inventory_history (variant_id, change_type, quantity_change, quantity_after, reference_id, reference_type, created_by)
         VALUES ($1, 'sale', $2, $3, $4, 'sale', $5)`,
        [item.variant_id, -item.quantity, invResult.rows[0].quantity, sale.id, req.user.id]
      );
    }

    // Insert payments
    for (const payment of payments) {
      await client.query(
        `INSERT INTO payments (sale_id, method, amount, reference)
         VALUES ($1, $2, $3, $4)`,
        [sale.id, payment.method, parseFloat(payment.amount), payment.reference || null]
      );
    }

    // Handle loyalty points
    let pointsEarned = 0;
    if (customer_id) {
      pointsEarned = Math.floor(total);

      // Deduct redeemed points and add earned points
      const custResult = await client.query(
        `UPDATE customers
         SET loyalty_points = loyalty_points - $1 + $2,
             total_spent = total_spent + $3,
             updated_at = NOW()
         WHERE id = $4
         RETURNING loyalty_points`,
        [validPointsRedeemed, pointsEarned, total.toFixed(2), customer_id]
      );

      const newPoints = custResult.rows[0].loyalty_points;
      const newTier = getLoyaltyTier(newPoints);

      await client.query(
        `UPDATE customers SET loyalty_tier = $1 WHERE id = $2`,
        [newTier, customer_id]
      );

      // Log loyalty earn
      if (pointsEarned > 0) {
        await client.query(
          `INSERT INTO loyalty_transactions (customer_id, points_change, transaction_type, reference_sale_id, notes)
           VALUES ($1, $2, 'earn', $3, $4)`,
          [customer_id, pointsEarned, sale.id, `Points earned on sale ${saleNumber}`]
        );
      }

      // Log loyalty redeem
      if (validPointsRedeemed > 0) {
        await client.query(
          `INSERT INTO loyalty_transactions (customer_id, points_change, transaction_type, reference_sale_id, notes)
           VALUES ($1, $2, 'redeem', $3, $4)`,
          [customer_id, -validPointsRedeemed, sale.id, `Points redeemed on sale ${saleNumber}`]
        );
      }

      // Update points_earned on sale record
      await client.query(
        'UPDATE sales SET points_earned = $1 WHERE id = $2',
        [pointsEarned, sale.id]
      );
    }

    await client.query('COMMIT');

    // Fetch complete sale
    const completeSale = await getSaleDetails(sale.id);

    res.status(201).json({
      success: true,
      message: 'Sale completed successfully.',
      data: completeSale
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * Helper to fetch full sale details
 */
const getSaleDetails = async (saleId) => {
  const saleResult = await query(
    `SELECT s.*,
            u.name AS cashier_name,
            c.name AS customer_name, c.phone AS customer_phone, c.loyalty_tier
     FROM sales s
     JOIN users u ON u.id = s.cashier_id
     LEFT JOIN customers c ON c.id = s.customer_id
     WHERE s.id = $1`,
    [saleId]
  );

  const itemsResult = await query(
    `SELECT si.*, pv.sku, pv.size, pv.flavor, p.name AS product_name
     FROM sale_items si
     JOIN product_variants pv ON pv.id = si.variant_id
     JOIN products p ON p.id = pv.product_id
     WHERE si.sale_id = $1`,
    [saleId]
  );

  const paymentsResult = await query(
    'SELECT * FROM payments WHERE sale_id = $1',
    [saleId]
  );

  return {
    ...saleResult.rows[0],
    items: itemsResult.rows,
    payments: paymentsResult.rows
  };
};

/**
 * GET /api/sales
 * List sales with filters. Paginated.
 */
const getSales = async (req, res, next) => {
  try {
    const {
      start_date, end_date, cashier_id, status,
      page = 1, limit = 20
    } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const params = [];
    const conditions = [];

    if (start_date) {
      params.push(start_date);
      conditions.push(`s.created_at >= $${params.length}::date`);
    }
    if (end_date) {
      params.push(end_date);
      conditions.push(`s.created_at < ($${params.length}::date + INTERVAL '1 day')`);
    }
    if (cashier_id) {
      params.push(parseInt(cashier_id));
      conditions.push(`s.cashier_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`s.status = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*) FROM sales s ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit));
    params.push(offset);

    const salesResult = await query(
      `SELECT s.id, s.sale_number, s.subtotal, s.discount_amount, s.tax_amount, s.total,
              s.status, s.points_earned, s.points_redeemed, s.created_at,
              u.name AS cashier_name,
              c.name AS customer_name
       FROM sales s
       JOIN users u ON u.id = s.cashier_id
       LEFT JOIN customers c ON c.id = s.customer_id
       ${whereClause}
       ORDER BY s.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
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
 * GET /api/sales/:id
 */
const getSaleById = async (req, res, next) => {
  try {
    const sale = await getSaleDetails(req.params.id);
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Sale not found.' });
    }
    res.json({ success: true, data: sale });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/sales/:id/void
 */
const voidSale = async (req, res, next) => {
  const client = await getClient();
  try {
    const { id } = req.params;
    const { reason } = req.body;

    await client.query('BEGIN');

    const saleResult = await client.query(
      'SELECT * FROM sales WHERE id = $1',
      [id]
    );

    if (saleResult.rows.length === 0) {
      throw Object.assign(new Error('Sale not found.'), { statusCode: 404 });
    }

    const sale = saleResult.rows[0];

    if (sale.status !== 'completed') {
      throw Object.assign(
        new Error(`Cannot void a sale with status: ${sale.status}`),
        { statusCode: 400 }
      );
    }

    // Restore inventory
    const itemsResult = await client.query(
      'SELECT * FROM sale_items WHERE sale_id = $1',
      [id]
    );

    for (const item of itemsResult.rows) {
      const invResult = await client.query(
        `UPDATE inventory SET quantity = quantity + $1, updated_at = NOW()
         WHERE variant_id = $2 RETURNING quantity`,
        [item.quantity, item.variant_id]
      );

      await client.query(
        `INSERT INTO inventory_history (variant_id, change_type, quantity_change, quantity_after, reference_id, reference_type, notes, created_by)
         VALUES ($1, 'return', $2, $3, $4, 'sale_void', $5, $6)`,
        [item.variant_id, item.quantity, invResult.rows[0].quantity, parseInt(id), `Void: ${reason || 'No reason provided'}`, req.user.id]
      );
    }

    // Reverse loyalty points
    if (sale.customer_id && (sale.points_earned > 0 || sale.points_redeemed > 0)) {
      const netPointChange = -sale.points_earned + sale.points_redeemed;
      await client.query(
        `UPDATE customers
         SET loyalty_points = loyalty_points + $1,
             total_spent = GREATEST(0, total_spent - $2),
             updated_at = NOW()
         WHERE id = $3`,
        [netPointChange, sale.total, sale.customer_id]
      );

      if (netPointChange !== 0) {
        await client.query(
          `INSERT INTO loyalty_transactions (customer_id, points_change, transaction_type, reference_sale_id, notes)
           VALUES ($1, $2, 'adjustment', $3, $4)`,
          [sale.customer_id, netPointChange, parseInt(id), `Points reversed for voided sale ${sale.sale_number}`]
        );
      }

      // Recalculate tier
      const custResult = await client.query(
        'SELECT loyalty_points FROM customers WHERE id = $1',
        [sale.customer_id]
      );
      const tier = getLoyaltyTier(custResult.rows[0].loyalty_points);
      await client.query('UPDATE customers SET loyalty_tier = $1 WHERE id = $2', [tier, sale.customer_id]);
    }

    // Mark sale as voided
    await client.query(
      `UPDATE sales SET status = 'voided', notes = COALESCE(notes || ' | ', '') || $1 WHERE id = $2`,
      [`Voided by ${req.user.name}: ${reason || 'No reason'}`, id]
    );

    await client.query('COMMIT');

    res.json({ success: true, message: 'Sale voided and inventory restored.' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * GET /api/sales/held
 */
const getHeldOrders = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT s.id, s.sale_number, s.subtotal, s.total, s.created_at, s.notes,
              u.name AS cashier_name,
              c.name AS customer_name
       FROM sales s
       JOIN users u ON u.id = s.cashier_id
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.status = 'held' AND s.cashier_id = $1
       ORDER BY s.created_at DESC`,
      [req.user.id]
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/sales/hold
 * Save current cart as a held order
 */
const holdOrder = async (req, res, next) => {
  const client = await getClient();
  try {
    const { customer_id, items = [], notes } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cannot hold an empty cart.' });
    }

    await client.query('BEGIN');

    const saleNumber = await generateSaleNumber(client);
    let subtotal = 0;
    items.forEach(item => {
      subtotal += parseFloat(item.unit_price) * parseInt(item.quantity);
    });

    const saleResult = await client.query(
      `INSERT INTO sales (sale_number, customer_id, cashier_id, subtotal, total, status, notes)
       VALUES ($1, $2, $3, $4, $4, 'held', $5) RETURNING *`,
      [saleNumber, customer_id || null, req.user.id, subtotal.toFixed(2), notes || 'Held order']
    );
    const sale = saleResult.rows[0];

    for (const item of items) {
      await client.query(
        `INSERT INTO sale_items (sale_id, variant_id, quantity, unit_price, total_price)
         VALUES ($1, $2, $3, $4, $5)`,
        [sale.id, item.variant_id, parseInt(item.quantity),
         parseFloat(item.unit_price), parseFloat(item.unit_price) * parseInt(item.quantity)]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Order held successfully.',
      data: { sale_number: saleNumber, id: sale.id }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * GET /api/sales/held/:id
 */
const retrieveHeldOrder = async (req, res, next) => {
  try {
    const { id } = req.params;

    const saleResult = await query(
      `SELECT s.*, c.name AS customer_name, c.phone AS customer_phone
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.id = $1 AND s.status = 'held'`,
      [id]
    );

    if (saleResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Held order not found.' });
    }

    const itemsResult = await query(
      `SELECT si.*, pv.sku, pv.size, pv.flavor, pv.price,
              p.name AS product_name, p.image_url
       FROM sale_items si
       JOIN product_variants pv ON pv.id = si.variant_id
       JOIN products p ON p.id = pv.product_id
       WHERE si.sale_id = $1`,
      [id]
    );

    res.json({
      success: true,
      data: { ...saleResult.rows[0], items: itemsResult.rows }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/sales/daily-summary
 */
const getDailySummary = async (req, res, next) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    const summaryResult = await query(
      `SELECT
         COUNT(*) AS total_transactions,
         COALESCE(SUM(total), 0) AS total_revenue,
         COALESCE(SUM(tax_amount), 0) AS total_tax,
         COALESCE(SUM(discount_amount), 0) AS total_discounts,
         COALESCE(AVG(total), 0) AS average_sale
       FROM sales
       WHERE status = 'completed'
         AND created_at >= $1::date
         AND created_at < ($1::date + INTERVAL '1 day')`,
      [date]
    );

    const topProductsResult = await query(
      `SELECT p.name AS product_name, pv.size, pv.flavor,
              SUM(si.quantity) AS units_sold,
              SUM(si.total_price) AS revenue
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN product_variants pv ON pv.id = si.variant_id
       JOIN products p ON p.id = pv.product_id
       WHERE s.status = 'completed'
         AND s.created_at >= $1::date
         AND s.created_at < ($1::date + INTERVAL '1 day')
       GROUP BY p.name, pv.size, pv.flavor
       ORDER BY units_sold DESC
       LIMIT 5`,
      [date]
    );

    const paymentResult = await query(
      `SELECT p.method, SUM(p.amount) AS total, COUNT(*) AS count
       FROM payments p
       JOIN sales s ON s.id = p.sale_id
       WHERE s.status = 'completed'
         AND s.created_at >= $1::date
         AND s.created_at < ($1::date + INTERVAL '1 day')
       GROUP BY p.method`,
      [date]
    );

    const hourlySalesResult = await query(
      `SELECT EXTRACT(HOUR FROM created_at) AS hour, COUNT(*) AS count, SUM(total) AS revenue
       FROM sales
       WHERE status = 'completed'
         AND created_at >= $1::date
         AND created_at < ($1::date + INTERVAL '1 day')
       GROUP BY EXTRACT(HOUR FROM created_at)
       ORDER BY hour`,
      [date]
    );

    res.json({
      success: true,
      data: {
        date,
        summary: summaryResult.rows[0],
        top_products: topProductsResult.rows,
        payment_breakdown: paymentResult.rows,
        hourly_sales: hourlySalesResult.rows
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/sales/:id/receipt
 */
const generateReceiptData = async (req, res, next) => {
  try {
    const { id } = req.params;

    const saleResult = await query(
      `SELECT s.*,
              u.name AS cashier_name,
              c.name AS customer_name, c.phone AS customer_phone,
              c.loyalty_points AS customer_points_balance
       FROM sales s
       JOIN users u ON u.id = s.cashier_id
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.id = $1`,
      [id]
    );

    if (saleResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Sale not found.' });
    }

    const sale = saleResult.rows[0];

    const itemsResult = await query(
      `SELECT si.quantity, si.unit_price, si.discount_amount, si.total_price,
              pv.sku, pv.size, pv.flavor,
              p.name AS product_name
       FROM sale_items si
       JOIN product_variants pv ON pv.id = si.variant_id
       JOIN products p ON p.id = pv.product_id
       WHERE si.sale_id = $1`,
      [id]
    );

    const paymentsResult = await query(
      'SELECT method, amount, reference FROM payments WHERE sale_id = $1',
      [id]
    );

    const totalPaid = paymentsResult.rows.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const change = totalPaid - parseFloat(sale.total);

    res.json({
      success: true,
      data: {
        receipt: {
          store_name: 'Atchaar POS',
          store_address: 'Maseru, Lesotho',
          store_phone: '+266 2200 0000',
          sale_number: sale.sale_number,
          date: sale.created_at,
          cashier: sale.cashier_name,
          customer: sale.customer_name || 'Walk-in Customer',
          items: itemsResult.rows,
          subtotal: parseFloat(sale.subtotal),
          discount_type: sale.discount_type,
          discount_value: parseFloat(sale.discount_value),
          discount_amount: parseFloat(sale.discount_amount),
          tax_rate: parseFloat(sale.tax_rate),
          tax_amount: parseFloat(sale.tax_amount),
          points_redeemed: sale.points_redeemed,
          points_redeemed_value: parseFloat(sale.points_redeemed_value),
          total: parseFloat(sale.total),
          payments: paymentsResult.rows,
          total_paid: totalPaid,
          change: Math.max(0, change),
          points_earned: sale.points_earned,
          customer_points_balance: sale.customer_points_balance,
          status: sale.status
        }
      }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createSale,
  getSales,
  getSaleById,
  voidSale,
  getHeldOrders,
  holdOrder,
  retrieveHeldOrder,
  getDailySummary,
  generateReceiptData
};
