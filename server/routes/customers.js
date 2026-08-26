const express = require('express');
const router = express.Router();
const {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getLoyaltyInfo,
  adjustLoyaltyPoints,
  getCustomerSalesHistory
} = require('../controllers/customerController');
const { authenticate, requireAdmin, requireCashierOrAdmin } = require('../middleware/auth');

// GET /api/customers
router.get('/', authenticate, requireCashierOrAdmin, getCustomers);

// POST /api/customers
router.post('/', authenticate, requireCashierOrAdmin, createCustomer);

// GET /api/customers/:id
router.get('/:id', authenticate, requireCashierOrAdmin, getCustomerById);

// PUT /api/customers/:id
router.put('/:id', authenticate, requireCashierOrAdmin, updateCustomer);

// DELETE /api/customers/:id
router.delete('/:id', authenticate, requireAdmin, deleteCustomer);

// GET /api/customers/:id/loyalty
router.get('/:id/loyalty', authenticate, requireCashierOrAdmin, getLoyaltyInfo);

// PUT /api/customers/:id/loyalty/adjust
router.put('/:id/loyalty/adjust', authenticate, requireAdmin, adjustLoyaltyPoints);

// GET /api/customers/:id/sales
router.get('/:id/sales', authenticate, requireCashierOrAdmin, getCustomerSalesHistory);

module.exports = router;
