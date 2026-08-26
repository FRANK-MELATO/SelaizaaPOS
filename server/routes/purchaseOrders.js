const express = require('express');
const router = express.Router();
const {
  getPurchaseOrders,
  createPurchaseOrder,
  receivePurchaseOrder
} = require('../controllers/supplierController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// GET /api/purchase-orders
router.get('/', authenticate, requireAdmin, getPurchaseOrders);

// POST /api/purchase-orders
router.post('/', authenticate, requireAdmin, createPurchaseOrder);

// POST /api/purchase-orders/:id/receive
router.post('/:id/receive', authenticate, requireAdmin, receivePurchaseOrder);

module.exports = router;
