const bcrypt = require('bcryptjs');
const { query } = require('../config/db');

/**
 * GET /api/users
 * List all staff (admin only)
 */
const getUsers = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, name, email, role, is_active, last_login, created_at, updated_at
       FROM users
       ORDER BY name`
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/users
 * Create staff account (admin only)
 */
const createUser = async (req, res, next) => {
  try {
    const { name, email, password, role = 'cashier' } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required.'
      });
    }

    if (!['admin', 'cashier'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Role must be "admin" or "cashier".'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long.'
      });
    }

    // Check if email already exists
    const emailCheck = await query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (emailCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email already exists.'
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, is_active, created_at`,
      [name.trim(), email.toLowerCase().trim(), passwordHash, role]
    );

    res.status(201).json({
      success: true,
      message: 'User account created.',
      data: result.rows[0]
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/users/:id
 * Update staff details (admin only)
 */
const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, role, password } = req.body;

    const existing = await query('SELECT id FROM users WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Prevent admin from removing their own admin role
    if (parseInt(id) === req.user.id && role && role !== 'admin') {
      return res.status(400).json({
        success: false,
        message: 'You cannot change your own role.'
      });
    }

    const fields = [];
    const values = [];
    let i = 1;

    if (name !== undefined)  { fields.push(`name = $${i++}`);  values.push(name.trim()); }
    if (email !== undefined) {
      // Check unique
      const emailCheck = await query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [email.toLowerCase().trim(), id]
      );
      if (emailCheck.rows.length > 0) {
        return res.status(409).json({ success: false, message: 'Email already in use.' });
      }
      fields.push(`email = $${i++}`);
      values.push(email.toLowerCase().trim());
    }
    if (role !== undefined)  { fields.push(`role = $${i++}`);  values.push(role); }

    if (password !== undefined) {
      if (password.length < 8) {
        return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
      }
      const hash = await bcrypt.hash(password, 10);
      fields.push(`password_hash = $${i++}`);
      values.push(hash);
    }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${i}
       RETURNING id, name, email, role, is_active, created_at, updated_at`,
      values
    );

    res.json({ success: true, message: 'User updated.', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/users/:id/toggle-active
 * Activate or deactivate staff account (admin only)
 */
const toggleUserActive = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Prevent self-deactivation
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot deactivate your own account.'
      });
    }

    const existing = await query(
      'SELECT id, name, is_active FROM users WHERE id = $1',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const currentStatus = existing.rows[0].is_active;
    const newStatus = !currentStatus;

    const result = await query(
      `UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2
       RETURNING id, name, email, role, is_active`,
      [newStatus, id]
    );

    res.json({
      success: true,
      message: `User ${newStatus ? 'activated' : 'deactivated'} successfully.`,
      data: result.rows[0]
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getUsers, createUser, updateUser, toggleUserActive };
