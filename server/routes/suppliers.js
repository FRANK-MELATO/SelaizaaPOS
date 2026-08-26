const express = require('express');
const router = express.Router();
const {
  getSuppliers,
  createSupplier,
  updateSupplier
} = require('../controllers/supplierController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// GET /api/suppliers
router.get('/', authenticate, requireAdmin, getSuppliers);

// POST /api/suppliers
router.post('/', authenticate, requireAdmin, createSupplier);

// PUT /api/suppliers/:id
router.put('/:id', authenticate, requireAdmin, updateSupplier);

module.exports = router;
