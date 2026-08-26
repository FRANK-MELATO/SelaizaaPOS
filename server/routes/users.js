const express = require('express');
const router = express.Router();
const { getUsers, createUser, updateUser, toggleUserActive } = require('../controllers/userController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// All user management requires admin
// GET /api/users
router.get('/', authenticate, requireAdmin, getUsers);

// POST /api/users
router.post('/', authenticate, requireAdmin, createUser);

// PUT /api/users/:id
router.put('/:id', authenticate, requireAdmin, updateUser);

// PATCH /api/users/:id/toggle-active
router.patch('/:id/toggle-active', authenticate, requireAdmin, toggleUserActive);

module.exports = router;
