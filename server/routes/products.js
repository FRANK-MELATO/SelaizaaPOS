const express = require('express');
const router = express.Router();
const {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  addVariant,
  updateVariant,
  deleteVariant,
  searchByBarcode,
  getCategories,
  createCategory
} = require('../controllers/productController');
const { authenticate, requireAdmin, requireCashierOrAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Category routes (must be before /:id to avoid conflicts)
// GET /api/categories
router.get('/categories', authenticate, getCategories);

// POST /api/categories
router.post('/categories', authenticate, requireAdmin, createCategory);

// Barcode search (must be before /:id)
// GET /api/products/barcode/:barcode
router.get('/barcode/:barcode', authenticate, requireCashierOrAdmin, searchByBarcode);

// Variant routes
// PUT /api/products/variants/:id
router.put('/variants/:id', authenticate, requireAdmin, updateVariant);

// DELETE /api/products/variants/:id
router.delete('/variants/:id', authenticate, requireAdmin, deleteVariant);

// Product CRUD
// GET /api/products
router.get('/', authenticate, requireCashierOrAdmin, getProducts);

// POST /api/products
router.post('/', authenticate, requireAdmin, upload.single('image'), createProduct);

// GET /api/products/:id
router.get('/:id', authenticate, requireCashierOrAdmin, getProductById);

// PUT /api/products/:id
router.put('/:id', authenticate, requireAdmin, upload.single('image'), updateProduct);

// DELETE /api/products/:id
router.delete('/:id', authenticate, requireAdmin, deleteProduct);

// POST /api/products/:id/variants
router.post('/:id/variants', authenticate, requireAdmin, addVariant);

module.exports = router;
