const express = require('express');
const router = express.Router();
const { getCategories, createCategory } = require('../controllers/productController');
const { authenticate, requireAdmin, requireCashierOrAdmin } = require('../middleware/auth');

// GET /api/categories
router.get('/', authenticate, requireCashierOrAdmin, getCategories);

// POST /api/categories
router.post('/', authenticate, requireAdmin, createCategory);

module.exports = router;
