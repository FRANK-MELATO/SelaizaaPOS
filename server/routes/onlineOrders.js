const express = require('express');
const router = express.Router();
const {
  getPublicProducts,
  placeOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
  trackOrder
} = require('../controllers/onlineOrderController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Public routes (no authentication required)
// GET /api/online/products
router.get('/products', getPublicProducts);

// POST /api/online/orders
router.post('/orders', placeOrder);

// GET /api/online/orders/track?order_number=XXX&phone=XXX  (public, before /:id)
router.get('/orders/track', trackOrder);

// Admin routes (authentication required)
// GET /api/online/orders
router.get('/orders', authenticate, requireAdmin, getOrders);

// GET /api/online/orders/:id
router.get('/orders/:id', authenticate, requireAdmin, getOrderById);

// PUT /api/online/orders/:id/status
router.put('/orders/:id/status', authenticate, requireAdmin, updateOrderStatus);

// POST /api/online/orders/:id/cancel
router.post('/orders/:id/cancel', authenticate, requireAdmin, cancelOrder);

module.exports = router;
