const express = require('express');
const router = express.Router();
const {
  getPurchaseOrders,
  createPurchaseOrder,
  getPurchaseOrderById,
  receivePurchaseOrder
} = require('../controllers/supplierController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// GET /api/purchase-orders
router.get('/', authenticate, requireAdmin, getPurchaseOrders);

// POST /api/purchase-orders
router.post('/', authenticate, requireAdmin, createPurchaseOrder);

// GET /api/purchase-orders/:id
router.get('/:id', authenticate, requireAdmin, getPurchaseOrderById);

// POST /api/purchase-orders/:id/receive
router.post('/:id/receive', authenticate, requireAdmin, receivePurchaseOrder);

module.exports = router;
