const express = require('express');
const router = express.Router();
const { login, logout, me, changePassword } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', login);

// POST /api/auth/logout
router.post('/logout', authenticate, logout);

// GET /api/auth/me
router.get('/me', authenticate, me);

// PUT /api/auth/change-password
router.put('/change-password', authenticate, changePassword);

module.exports = router;
