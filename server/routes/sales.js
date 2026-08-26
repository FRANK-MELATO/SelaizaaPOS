const express = require('express');
const router = express.Router();
const {
  createSale,
  getSales,
  getSaleById,
  voidSale,
  getHeldOrders,
  holdOrder,
  retrieveHeldOrder,
  getDailySummary,
  generateReceiptData
} = require('../controllers/salesController');
const { authenticate, requireAdmin, requireCashierOrAdmin } = require('../middleware/auth');

// These specific routes MUST come before /:id to avoid conflicts

// GET /api/sales/held
router.get('/held', authenticate, requireCashierOrAdmin, getHeldOrders);

// POST /api/sales/hold
router.post('/hold', authenticate, requireCashierOrAdmin, holdOrder);

// GET /api/sales/daily-summary
router.get('/daily-summary', authenticate, requireCashierOrAdmin, getDailySummary);

// GET /api/sales/held/:id
router.get('/held/:id', authenticate, requireCashierOrAdmin, retrieveHeldOrder);

// POST /api/sales - Create sale
router.post('/', authenticate, requireCashierOrAdmin, createSale);

// GET /api/sales - List sales
router.get('/', authenticate, requireCashierOrAdmin, getSales);

// GET /api/sales/:id
router.get('/:id', authenticate, requireCashierOrAdmin, getSaleById);

// POST /api/sales/:id/void
router.post('/:id/void', authenticate, requireAdmin, voidSale);

// GET /api/sales/:id/receipt
router.get('/:id/receipt', authenticate, requireCashierOrAdmin, generateReceiptData);

module.exports = router;
