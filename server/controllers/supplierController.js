const { query, getClient } = require('../config/db');

/**
 * Generate PO number: PO-YYYYMMDD-NNNN
 */
const generatePONumber = async (client) => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `PO-${dateStr}-`;

  const result = await client.query(
    `SELECT COUNT(*) FROM purchase_orders WHERE po_number LIKE $1`,
    [`${prefix}%`]
  );
  const seq = parseInt(result.rows[0].count) + 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
};

/**
 * GET /api/suppliers
 */
const getSuppliers = async (req, res, next) => {
  try {
    const { search } = req.query;
    const params = [];
    let whereClause = '';

    if (search) {
      params.push(`%${search}%`);
      whereClause = `WHERE name ILIKE $1 OR contact_person ILIKE $1 OR email ILIKE $1`;
    }

    const result = await query(
      `SELECT s.*, COUNT(po.id) AS total_orders
       FROM suppliers s
       LEFT JOIN purchase_orders po ON po.supplier_id = s.id
       ${whereClause}
       GROUP BY s.id
       ORDER BY s.name`,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/suppliers
 */
const createSupplier = async (req, res, next) => {
  try {
    const { name, contact_person, phone, email, address } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Supplier name is required.' });
    }

    const result = await query(
      `INSERT INTO suppliers (name, contact_person, phone, email, address)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name.trim(), contact_person || null, phone || null,
       email ? email.toLowerCase().trim() : null, address || null]
    );

    res.status(201).json({ success: true, message: 'Supplier created.', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/suppliers/:id
 */
const updateSupplier = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, contact_person, phone, email, address } = req.body;

    const existing = await query('SELECT id FROM suppliers WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Supplier not found.' });
    }

    const fields = [];
    const values = [];
    let i = 1;

    if (name !== undefined)           { fields.push(`name = $${i++}`);           values.push(name.trim()); }
    if (contact_person !== undefined) { fields.push(`contact_person = $${i++}`); values.push(contact_person); }
    if (phone !== undefined)          { fields.push(`phone = $${i++}`);          values.push(phone); }
    if (email !== undefined)          { fields.push(`email = $${i++}`);          values.push(email ? email.toLowerCase().trim() : null); }
    if (address !== undefined)        { fields.push(`address = $${i++}`);        values.push(address); }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }

    values.push(id);

    const result = await query(
      `UPDATE suppliers SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );

    res.json({ success: true, message: 'Supplier updated.', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/purchase-orders
 */
const createPurchaseOrder = async (req, res, next) => {
  const client = await getClient();
  try {
    const { supplier_id, items = [], notes } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Purchase order must have at least one item.' });
    }

    await client.query('BEGIN');

    const poNumber = await generatePONumber(client);

    // Calculate total cost
    let totalCost = 0;
    for (const item of items) {
      if (!item.variant_id || !item.quantity_ordered || !item.unit_cost) {
        throw Object.assign(
          new Error('Each item requires variant_id, quantity_ordered, and unit_cost.'),
          { statusCode: 400 }
        );
      }
      totalCost += parseInt(item.quantity_ordered) * parseFloat(item.unit_cost);

      // Verify variant exists
      const varCheck = await client.query(
        'SELECT id FROM product_variants WHERE id = $1',
        [item.variant_id]
      );
      if (varCheck.rows.length === 0) {
        throw Object.assign(
          new Error(`Variant ID ${item.variant_id} not found.`),
          { statusCode: 400 }
        );
      }
    }

    // Create PO
    const poResult = await client.query(
      `INSERT INTO purchase_orders (po_number, supplier_id, total_cost, notes, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [poNumber, supplier_id || null, totalCost.toFixed(2), notes || null, req.user.id]
    );
    const po = poResult.rows[0];

    // Create PO items
    const poItems = [];
    for (const item of items) {
      const itemResult = await client.query(
        `INSERT INTO purchase_order_items (po_id, variant_id, quantity_ordered, unit_cost)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [po.id, item.variant_id, parseInt(item.quantity_ordered), parseFloat(item.unit_cost)]
      );
      poItems.push(itemResult.rows[0]);
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Purchase order created.',
      data: { ...po, items: poItems }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * GET /api/purchase-orders
 */
const getPurchaseOrders = async (req, res, next) => {
  try {
    const { status, supplier_id, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const conditions = [];

    if (status) {
      params.push(status);
      conditions.push(`po.status = $${params.length}`);
    }
    if (supplier_id) {
      params.push(parseInt(supplier_id));
      conditions.push(`po.supplier_id = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*) FROM purchase_orders po ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit));
    params.push(offset);

    const result = await query(
      `SELECT po.id, po.po_number, po.status, po.total_cost, po.notes, po.created_at, po.received_at,
              s.name AS supplier_name,
              u.name AS created_by_name
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po.supplier_id
       LEFT JOIN users u ON u.id = po.created_by
       ${whereClause}
       ORDER BY po.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      success: true,
      data: {
        purchase_orders: result.rows,
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
 * POST /api/purchase-orders/:id/receive
 * Mark PO as received, update inventory
 */
const receivePurchaseOrder = async (req, res, next) => {
  const client = await getClient();
  try {
    const { id } = req.params;
    const { items } = req.body; // [{po_item_id, quantity_received}]

    await client.query('BEGIN');

    const poResult = await client.query(
      'SELECT * FROM purchase_orders WHERE id = $1',
      [id]
    );

    if (poResult.rows.length === 0) {
      throw Object.assign(new Error('Purchase order not found.'), { statusCode: 404 });
    }

    const po = poResult.rows[0];

    if (po.status === 'received') {
      throw Object.assign(new Error('Purchase order already received.'), { statusCode: 400 });
    }

    if (po.status === 'cancelled') {
      throw Object.assign(new Error('Cannot receive a cancelled purchase order.'), { statusCode: 400 });
    }

    // Get PO items
    const poItemsResult = await client.query(
      'SELECT * FROM purchase_order_items WHERE po_id = $1',
      [id]
    );

    // If no items array provided, receive all items as ordered
    const receiveItems = items || poItemsResult.rows.map(i => ({
      po_item_id: i.id,
      quantity_received: i.quantity_ordered
    }));

    for (const receiveItem of receiveItems) {
      const poItem = poItemsResult.rows.find(i => i.id === receiveItem.po_item_id);
      if (!poItem) {
        throw Object.assign(new Error(`PO item ID ${receiveItem.po_item_id} not found.`), { statusCode: 400 });
      }

      const qtyReceived = parseInt(receiveItem.quantity_received);

      // Update quantity received on PO item
      await client.query(
        `UPDATE purchase_order_items SET quantity_received = $1 WHERE id = $2`,
        [qtyReceived, receiveItem.po_item_id]
      );

      // Update inventory
      const invResult = await client.query(
        `UPDATE inventory SET quantity = quantity + $1, updated_at = NOW()
         WHERE variant_id = $2 RETURNING quantity`,
        [qtyReceived, poItem.variant_id]
      );

      if (invResult.rows.length === 0) {
        // Inventory record might not exist, create it
        await client.query(
          `INSERT INTO inventory (variant_id, quantity) VALUES ($1, $2)
           ON CONFLICT (variant_id) DO UPDATE SET quantity = inventory.quantity + $2`,
          [poItem.variant_id, qtyReceived]
        );
      }

      const quantityAfter = invResult.rows.length > 0 ? invResult.rows[0].quantity : qtyReceived;

      // Log inventory history
      await client.query(
        `INSERT INTO inventory_history (variant_id, change_type, quantity_change, quantity_after, reference_id, reference_type, notes, created_by)
         VALUES ($1, 'purchase', $2, $3, $4, 'purchase_order', $5, $6)`,
        [poItem.variant_id, qtyReceived, quantityAfter, parseInt(id), `Received on PO ${po.po_number}`, req.user.id]
      );
    }

    // Update PO status
    await client.query(
      `UPDATE purchase_orders SET status = 'received', received_at = NOW() WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Purchase order marked as received and inventory updated.',
      data: { po_number: po.po_number, id: parseInt(id) }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

module.exports = {
  getSuppliers,
  createSupplier,
  updateSupplier,
  createPurchaseOrder,
  getPurchaseOrders,
  receivePurchaseOrder
};
