const express = require('express');
const router = express.Router();
const {
  getSalesSummary,
  getRevenueChart,
  getBestSellingProducts,
  getPaymentMethodBreakdown,
  getLoyaltyReport,
  getInventoryReport,
  getPurchaseSpend
} = require('../controllers/reportController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// All reports require admin
// GET /api/reports/sales-summary
router.get('/sales-summary', authenticate, requireAdmin, getSalesSummary);

// GET /api/reports/revenue-chart
router.get('/revenue-chart', authenticate, requireAdmin, getRevenueChart);

// GET /api/reports/best-selling
router.get('/best-selling', authenticate, requireAdmin, getBestSellingProducts);

// GET /api/reports/payment-methods
router.get('/payment-methods', authenticate, requireAdmin, getPaymentMethodBreakdown);

// GET /api/reports/loyalty
router.get('/loyalty', authenticate, requireAdmin, getLoyaltyReport);

// GET /api/reports/inventory
router.get('/inventory', authenticate, requireAdmin, getInventoryReport);

// GET /api/reports/purchase-spend
router.get('/purchase-spend', authenticate, requireAdmin, getPurchaseSpend);

module.exports = router;
