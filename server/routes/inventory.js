const express = require('express');
const router = express.Router();
const {
  getInventory,
  adjustStock,
  writeOff,
  getInventoryHistory,
  getLowStockAlerts,
  getInventoryValuation
} = require('../controllers/inventoryController');
const { authenticate, requireAdmin, requireCashierOrAdmin } = require('../middleware/auth');

// GET /api/inventory
router.get('/', authenticate, requireCashierOrAdmin, getInventory);

// POST /api/inventory/adjust
router.post('/adjust', authenticate, requireAdmin, adjustStock);

// POST /api/inventory/write-off
router.post('/write-off', authenticate, requireAdmin, writeOff);

// GET /api/inventory/history
router.get('/history', authenticate, requireAdmin, getInventoryHistory);

// GET /api/inventory/low-stock
router.get('/low-stock', authenticate, requireCashierOrAdmin, getLowStockAlerts);

// GET /api/inventory/valuation
router.get('/valuation', authenticate, requireAdmin, getInventoryValuation);

module.exports = router;
