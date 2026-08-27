import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Edit2, Trash2, ChevronDown, ChevronRight, Package, Upload,
  Tag, Search, RefreshCw, AlertTriangle, BarChart2, RotateCcw
} from 'lucide-react';
import toast from 'react-hot-toast';
import { productService } from '../services/api';
import { formatCurrency } from '../utils/formatters';
import Modal from '../components/common/Modal';
import Badge from '../components/common/Badge';
import SearchInput from '../components/common/SearchInput';
import StatCard from '../components/common/StatCard';
import LoadingSpinner from '../components/common/LoadingSpinner';

const UNITS = ['ml', 'L', 'g', 'kg', 'pcs', 'pack', 'other'];

const parseSize = (size) => {
  if (!size) return { size_amount: '', size_unit: 'ml', size_custom: '' };
  const m = size.match(/^(\d+(?:\.\d+)?)\s*(ml|L|g|kg|pcs|pack)$/i);
  if (m) {
    const u = m[2] === 'L' ? 'L' : m[2].toLowerCase();
    if (UNITS.includes(u)) return { size_amount: m[1], size_unit: u, size_custom: '' };
  }
  // "other" format: "2 jar" or "2 bottles"
  const m2 = size.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
  if (m2) return { size_amount: m2[1], size_unit: 'other', size_custom: m2[2] };
  return { size_amount: '', size_unit: 'other', size_custom: size };
};

const buildSize = (row) => {
  if (row.size_unit === 'other') {
    const amt = row.size_amount || '';
    const name = row.size_custom || '';
    if (amt && name) return `${amt} ${name}`;
    return amt || name;
  }
  return row.size_amount ? `${row.size_amount}${row.size_unit}` : '';
};

const UNIT_CONVERSIONS = {
  ml: { L: (v) => v / 1000 },
  L:  { ml: (v) => v * 1000 },
  g:  { kg: (v) => v / 1000 },
  kg: { g:  (v) => v * 1000 },
};

const convertAmount = (amount, fromUnit, toUnit) => {
  const fn = UNIT_CONVERSIONS[fromUnit]?.[toUnit];
  if (!fn || !amount) return amount;
  const parsed = parseFloat(amount);
  if (isNaN(parsed) || parsed === 0) return amount;
  const result = fn(parsed);
  return Number.isInteger(result) ? String(result) : parseFloat(result.toPrecision(6)).toString();
};

const emptyProduct = { name: '', description: '', category_id: '', image_url: '' };
const emptyVariant = { flavor: '', size_amount: '', size_unit: 'ml', size_custom: '', sku: '', unit_price: '', cost_price: '', stock_quantity: '', low_stock_threshold: 5 };

function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [expandedProducts, setExpandedProducts] = useState({});
  const [showInactive, setShowInactive] = useState(false);

  // Modals
  const [showProductModal, setShowProductModal] = useState(false);
  const [showVariantModal, setShowVariantModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteVariantConfirm, setShowDeleteVariantConfirm] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingVariant, setEditingVariant] = useState(null);
  const [targetProductId, setTargetProductId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteVariantTarget, setDeleteVariantTarget] = useState(null);

  // Forms
  const [productForm, setProductForm] = useState(emptyProduct);
  const [variantRows, setVariantRows] = useState([{ ...emptyVariant }]);
  const [variantForm, setVariantForm] = useState(emptyVariant);
  const [categoryName, setCategoryName] = useState('');
  const [inlineCatName, setInlineCatName] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (searchQuery) params.search = searchQuery;
      // was `category` — the backend reads `category_id`, so this filter
      // silently did nothing before
      if (selectedCategory !== 'all') params.category_id = selectedCategory;
      if (showInactive) params.include_inactive = true;
      const res = await productService.getProducts(params);
      setProducts(Array.isArray(res?.data?.products) ? res.data.products : []);
    } catch {
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedCategory, showInactive]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await productService.getCategories();
      setCategories(Array.isArray(res?.data || res) ? (res?.data || res) : []);
    } catch {}
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);
  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const totalProducts = products.length;
  const totalVariants = products.reduce((s, p) => s + (p.variants?.length || 0), 0);
  const lowStockCount = products.reduce((s, p) =>
    s + (p.variants?.filter(v => (v.quantity ?? 0) > 0 && (v.quantity ?? 0) <= (v.low_stock_threshold || 5)).length || 0), 0);

  const toggleExpand = (id) => {
    setExpandedProducts(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // ── Product CRUD ──
  const openAddProduct = () => {
    setEditingProduct(null);
    setProductForm(emptyProduct);
    setVariantRows([{ ...emptyVariant }]);
    setFormErrors({});
    setShowProductModal(true);
  };

  const openEditProduct = (product) => {
    setEditingProduct(product);
    setProductForm({
      name: product.name || '',
      description: product.description || '',
      category_id: product.category_id || '',
      image_url: product.image_url || ''
    });
    setFormErrors({});
    setShowProductModal(true);
  };

  const validateProduct = () => {
    const errs = {};
    if (!productForm.name.trim()) errs.name = 'Name is required';
    if (!editingProduct) {
      variantRows.forEach((row, i) => {
        if (!row.unit_price) errs[`price_${i}`] = 'Price required';
      });
    }
    return errs;
  };

  const handleSaveProduct = async () => {
    const errs = validateProduct();
    if (Object.keys(errs).length) { setFormErrors(errs); return; }
    setSaving(true);
    try {
      if (editingProduct) {
        await productService.updateProduct(editingProduct.id, productForm);
        toast.success('Product updated');
      } else {
        const mappedVariants = variantRows.map(r => ({ ...r, size: buildSize(r) }));
        const catId = productForm.category_id === '__new__' ? '' : productForm.category_id;
        const res = await productService.createProduct({ ...productForm, category_id: catId, variants: mappedVariants });
        toast.success('Product created');
      }
      setShowProductModal(false);
      fetchProducts();
    } catch (err) {
      toast.error(err.message || 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProduct = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await productService.deleteProduct(deleteTarget.id);
      toast.success('Product deactivated — hidden from POS and the store, but recoverable');
      setShowDeleteConfirm(false);
      fetchProducts();
    } catch (err) {
      toast.error(err.message || 'Failed to delete product');
    } finally {
      setSaving(false);
    }
  };

  const handleReactivateProduct = async (product) => {
    try {
      await productService.updateProduct(product.id, { is_active: true });
      toast.success(`${product.name} reactivated`);
      fetchProducts();
    } catch (err) {
      toast.error(err.message || 'Failed to reactivate product');
    }
  };

  const handleReactivateVariant = async (productId, variant) => {
    try {
      await productService.updateVariant(productId, variant.id, { is_active: true });
      toast.success(`${variant.sku || 'Variant'} reactivated`);
      fetchProducts();
    } catch (err) {
      toast.error(err.message || 'Failed to reactivate variant');
    }
  };

  // ── Variant CRUD ──
  const openAddVariant = (productId) => {
    setTargetProductId(productId);
    setEditingVariant(null);
    setVariantForm(emptyVariant);
    setFormErrors({});
    setShowVariantModal(true);
  };

  const openEditVariant = (productId, variant) => {
    setTargetProductId(productId);
    setEditingVariant(variant);
    setVariantForm({
      flavor: variant.flavor || '',
      ...parseSize(variant.size),
      sku: variant.sku || '',
      unit_price: variant.price || '',
      cost_price: variant.cost_price || '',
      stock_quantity: variant.quantity || 0,
      low_stock_threshold: variant.low_stock_threshold || 5
    });
    setFormErrors({});
    setShowVariantModal(true);
  };

  const handleSaveVariant = async () => {
    if (!variantForm.unit_price) { setFormErrors({ unit_price: 'Price required' }); return; }
    setSaving(true);
    try {
      const payload = { ...variantForm, size: buildSize(variantForm) };
      if (editingVariant) {
        await productService.updateVariant(targetProductId, editingVariant.id, payload);
        toast.success('Variant updated');
      } else {
        await productService.addVariant(targetProductId, payload);
        toast.success('Variant added');
      }
      setShowVariantModal(false);
      fetchProducts();
    } catch (err) {
      toast.error(err.message || 'Failed to save variant');
    } finally {
      setSaving(false);
    }
  };

  const openDeleteVariantConfirm = (productId, variant) => {
    setDeleteVariantTarget({ productId, variant });
    setShowDeleteVariantConfirm(true);
  };

  const handleDeleteVariant = async () => {
    if (!deleteVariantTarget) return;
    setSaving(true);
    try {
      await productService.deleteVariant(deleteVariantTarget.productId, deleteVariantTarget.variant.id);
      toast.success('Variant deactivated — hidden from POS and the store, but recoverable');
      setShowDeleteVariantConfirm(false);
      fetchProducts();
    } catch (err) {
      toast.error(err.message || 'Failed to delete variant');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!categoryName.trim()) return;
    try {
      await productService.createCategory({ name: categoryName });
      toast.success('Category created');
      setCategoryName('');
      setShowCategoryModal(false);
      fetchCategories();
    } catch (err) {
      toast.error(err.message || 'Failed to create category');
    }
  };

  const handleInlineCatCreate = async () => {
    if (!inlineCatName.trim()) return;
    try {
      const res = await productService.createCategory({ name: inlineCatName.trim() });
      const newCat = res?.data || res;
      await fetchCategories();
      setProductForm(p => ({ ...p, category_id: String(newCat.id) }));
      setInlineCatName('');
    } catch (err) {
      toast.error(err.message || 'Failed to create category');
    }
  };

  const addVariantRow = () => setVariantRows(prev => [...prev, { ...emptyVariant }]);
  const updateVariantRow = (i, field, val) => {
    setVariantRows(prev => prev.map((row, idx) => idx === i ? { ...row, [field]: val } : row));
  };
  const removeVariantRow = (i) => {
    if (variantRows.length === 1) return;
    setVariantRows(prev => prev.filter((_, idx) => idx !== i));
  };

  const handleRowUnitChange = (i, newUnit) => {
    const row = variantRows[i];
    const newAmount = convertAmount(row.size_amount, row.size_unit, newUnit);
    setVariantRows(prev => prev.map((r, idx) =>
      idx === i ? { ...r, size_unit: newUnit, size_amount: newAmount } : r
    ));
  };

  const handleFormUnitChange = (newUnit) => {
    const newAmount = convertAmount(variantForm.size_amount, variantForm.size_unit, newUnit);
    setVariantForm(p => ({ ...p, size_unit: newUnit, size_amount: newAmount }));
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Products</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Manage your product catalog</p>
        </div>
        <div className="sm:ml-auto flex gap-2">
          <button onClick={() => setShowCategoryModal(true)} className="btn-secondary flex items-center gap-2">
            <Tag className="h-4 w-4" /> Categories
          </button>
          <button onClick={openAddProduct} className="btn-primary flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add Product
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={Package} label="Total Products" value={totalProducts} color="orange" />
        <StatCard icon={BarChart2} label="Active Variants" value={totalVariants} color="blue" />
        <StatCard icon={AlertTriangle} label="Low Stock" value={lowStockCount} color="yellow" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput
          placeholder="Search products..."
          value={searchQuery}
          onChange={setSearchQuery}
          className="flex-1"
        />
        <select
          value={selectedCategory}
          onChange={e => setSelectedCategory(e.target.value)}
          className="input sm:w-48"
        >
          <option value="all">All Categories</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 px-3 text-sm text-gray-600 dark:text-gray-400 flex-shrink-0 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            className="w-4 h-4 accent-orange-600"
          />
          Show deactivated
        </label>
        <button onClick={fetchProducts} className="btn-secondary flex items-center gap-2 flex-shrink-0">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Product list */}
      {loading ? (
        <LoadingSpinner label="Loading products..." />
      ) : products.length === 0 ? (
        <div className="card p-12 text-center">
          <Package className="h-16 w-16 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">No products found. Add your first product!</p>
          <button onClick={openAddProduct} className="btn-primary mt-4">Add Product</button>
        </div>
      ) : (
        <div className="space-y-3">
          {products.map(product => (
            <div key={product.id} className={`card overflow-hidden ${product.is_active === false ? 'opacity-60' : ''}`}>
              {/* Product header row */}
              <div className="flex items-center gap-3 p-4">
                {/* Expand toggle */}
                <button
                  onClick={() => toggleExpand(product.id)}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  {expandedProducts[product.id]
                    ? <ChevronDown className="h-4 w-4" />
                    : <ChevronRight className="h-4 w-4" />
                  }
                </button>

                {/* Image */}
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center flex-shrink-0">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                  ) : (
                    <Package className="h-5 w-5 text-orange-400" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{product.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {product.is_active === false && <Badge color="gray" size="sm">Deactivated</Badge>}
                    {product.category_name && (
                      <Badge color="orange" size="sm">{product.category_name}</Badge>
                    )}
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {product.variants?.length || 0} variant{product.variants?.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                {product.is_active === false ? (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleReactivateProduct(product)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 rounded-lg font-medium transition-colors"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Reactivate
                    </button>
                  </div>
                ) : (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => openAddVariant(product.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 hover:bg-orange-100 rounded-lg transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> Variant
                  </button>
                  <button
                    onClick={() => openEditProduct(product)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => { setDeleteTarget(product); setShowDeleteConfirm(true); }}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                )}
              </div>

              {/* Expanded variants */}
              {expandedProducts[product.id] && (
                <div className="border-t border-gray-100 dark:border-gray-700">
                  {!product.variants || product.variants.length === 0 ? (
                    <div className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                      No variants. <button onClick={() => openAddVariant(product.id)} className="text-orange-600 hover:underline">Add one</button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-700/50">
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">SKU</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Flavor</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Size</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Price</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Cost</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Stock</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Status</th>
                            <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 dark:text-gray-400">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                          {product.variants.map(v => {
                            const stockStatus = (v.quantity ?? 0) <= 0 ? 'out_of_stock'
                              : (v.quantity ?? 0) <= (v.low_stock_threshold || 5) ? 'low_stock'
                              : 'in_stock';
                            return (
                              <tr key={v.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 ${v.is_active === false ? 'opacity-60' : ''}`}>
                                <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 font-mono text-xs">{v.sku || '-'}</td>
                                <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">{v.flavor || '-'}</td>
                                <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">{v.size || '-'}</td>
                                <td className="px-4 py-2.5 font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(v.price)}</td>
                                <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">{v.cost_price ? formatCurrency(v.cost_price) : '-'}</td>
                                <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-gray-100">{v.quantity ?? 0}</td>
                                <td className="px-4 py-2.5">
                                  {v.is_active === false ? (
                                    <Badge color="gray" size="sm">Deactivated</Badge>
                                  ) : (
                                    <Badge
                                      color={stockStatus === 'in_stock' ? 'green' : stockStatus === 'low_stock' ? 'yellow' : 'red'}
                                      size="sm"
                                    >
                                      {stockStatus === 'in_stock' ? 'In Stock' : stockStatus === 'low_stock' ? 'Low Stock' : 'Out of Stock'}
                                    </Badge>
                                  )}
                                </td>
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center justify-end gap-1">
                                    {v.is_active === false ? (
                                      <button
                                        onClick={() => handleReactivateVariant(product.id, v)}
                                        className="flex items-center gap-1 px-2 py-1 text-xs text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors"
                                      >
                                        <RotateCcw className="h-3.5 w-3.5" /> Reactivate
                                      </button>
                                    ) : (
                                      <>
                                        <button
                                          onClick={() => openEditVariant(product.id, v)}
                                          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                        >
                                          <Edit2 className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                          onClick={() => openDeleteVariantConfirm(product.id, v)}
                                          className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Add/Edit Product Modal ── */}
      <Modal
        isOpen={showProductModal}
        onClose={() => setShowProductModal(false)}
        title={editingProduct ? 'Edit Product' : 'Add New Product'}
        size="lg"
        footer={
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowProductModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSaveProduct} disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : editingProduct ? 'Save Changes' : 'Create Product'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Product Name *</label>
            <input
              type="text"
              value={productForm.name}
              onChange={e => setProductForm(p => ({ ...p, name: e.target.value }))}
              className={`input ${formErrors.name ? 'input-error' : ''}`}
              placeholder="e.g. Mixed Atchaar"
            />
            {formErrors.name && <p className="error-text">{formErrors.name}</p>}
          </div>
          <div>
            <label className="label">Description</label>
            <textarea
              value={productForm.description}
              onChange={e => setProductForm(p => ({ ...p, description: e.target.value }))}
              className="input resize-none h-20"
              placeholder="Product description..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Category</label>
              <select
                value={productForm.category_id}
                onChange={e => {
                  if (e.target.value === '__new__') {
                    setProductForm(p => ({ ...p, category_id: '__new__' }));
                  } else {
                    setProductForm(p => ({ ...p, category_id: e.target.value }));
                    setInlineCatName('');
                  }
                }}
                className="input"
              >
                <option value="">Select category</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
                <option value="__new__">+ New category...</option>
              </select>
              {productForm.category_id === '__new__' && (
                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    value={inlineCatName}
                    onChange={e => setInlineCatName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleInlineCatCreate()}
                    className="input flex-1 text-sm"
                    placeholder="Category name..."
                    autoFocus
                  />
                  <button
                    onClick={handleInlineCatCreate}
                    className="px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm rounded-lg transition-colors"
                  >
                    Create
                  </button>
                </div>
              )}
            </div>
            <div>
              <label className="label">Image URL</label>
              <input
                type="text"
                value={productForm.image_url}
                onChange={e => setProductForm(p => ({ ...p, image_url: e.target.value }))}
                className="input"
                placeholder="https://..."
              />
            </div>
          </div>

          {/* Variants (new product only) */}
          {!editingProduct && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Variants *</label>
                <button onClick={addVariantRow} className="text-xs text-orange-600 hover:text-orange-700 flex items-center gap-1">
                  <Plus className="h-3.5 w-3.5" /> Add Row
                </button>
              </div>
              <div className="space-y-2">
                {variantRows.map((row, i) => (
                  <div key={i} className="space-y-1">
                    <div className="grid grid-cols-8 gap-1.5 items-start">
                      <input type="text" placeholder="Flavor" value={row.flavor} onChange={e => updateVariantRow(i, 'flavor', e.target.value)} className="input text-sm py-1.5 col-span-2" />
                      <input
                        type="number"
                        placeholder="Qty"
                        value={row.size_amount}
                        onChange={e => updateVariantRow(i, 'size_amount', e.target.value)}
                        className="input text-sm py-1.5"
                      />
                      <select value={row.size_unit} onChange={e => handleRowUnitChange(i, e.target.value)} className="input text-sm py-1.5">
                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                      <input type="number" placeholder="Price *" value={row.unit_price} onChange={e => updateVariantRow(i, 'unit_price', e.target.value)} className={`input text-sm py-1.5 ${formErrors[`price_${i}`] ? 'input-error' : ''}`} />
                      <input type="number" placeholder="Cost" value={row.cost_price} onChange={e => updateVariantRow(i, 'cost_price', e.target.value)} className="input text-sm py-1.5" />
                      <input type="number" placeholder="Stock" value={row.stock_quantity} onChange={e => updateVariantRow(i, 'stock_quantity', e.target.value)} className="input text-sm py-1.5" />
                      <button onClick={() => removeVariantRow(i)} disabled={variantRows.length === 1} className="p-1.5 text-red-400 hover:text-red-600 disabled:opacity-30">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {row.size_unit === 'other' && (
                      <input
                        type="text"
                        placeholder="Custom unit name (e.g. jar, bottle, loaf)"
                        value={row.size_custom}
                        onChange={e => updateVariantRow(i, 'size_custom', e.target.value)}
                        className="input text-sm py-1.5 w-full"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ── Add/Edit Variant Modal ── */}
      <Modal
        isOpen={showVariantModal}
        onClose={() => setShowVariantModal(false)}
        title={editingVariant ? 'Edit Variant' : 'Add Variant'}
        size="sm"
        footer={
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowVariantModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSaveVariant} disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : editingVariant ? 'Save Changes' : 'Add Variant'}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Flavor</label>
              <input type="text" value={variantForm.flavor} onChange={e => setVariantForm(p => ({ ...p, flavor: e.target.value }))} className="input" placeholder="e.g. Mild, Hot, Garlic" />
            </div>
            <div>
              <label className="label">Unit</label>
              <select value={variantForm.size_unit} onChange={e => handleFormUnitChange(e.target.value)} className="input">
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          {variantForm.size_unit === 'other' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Amount</label>
                <input type="number" value={variantForm.size_amount} onChange={e => setVariantForm(p => ({ ...p, size_amount: e.target.value }))} className="input" placeholder="e.g. 2" />
              </div>
              <div>
                <label className="label">Unit Name</label>
                <input type="text" value={variantForm.size_custom} onChange={e => setVariantForm(p => ({ ...p, size_custom: e.target.value }))} className="input" placeholder="e.g. jar, bottle" />
              </div>
            </div>
          ) : (
            <div>
              <label className="label">Quantity</label>
              <input type="number" value={variantForm.size_amount} onChange={e => setVariantForm(p => ({ ...p, size_amount: e.target.value }))} className="input" placeholder="e.g. 90" />
            </div>
          )}
          <div>
            <label className="label">SKU</label>
            <input type="text" value={variantForm.sku} onChange={e => setVariantForm(p => ({ ...p, sku: e.target.value }))} className="input" placeholder="Auto-generated if blank" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Selling Price (R) *</label>
              <input type="number" step="0.01" value={variantForm.unit_price} onChange={e => setVariantForm(p => ({ ...p, unit_price: e.target.value }))} className={`input ${formErrors.unit_price ? 'input-error' : ''}`} placeholder="0.00" />
              {formErrors.unit_price && <p className="error-text">{formErrors.unit_price}</p>}
            </div>
            <div>
              <label className="label">Cost Price (R)</label>
              <input type="number" step="0.01" value={variantForm.cost_price} onChange={e => setVariantForm(p => ({ ...p, cost_price: e.target.value }))} className="input" placeholder="0.00" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Stock Quantity</label>
              <input type="number" value={variantForm.stock_quantity} onChange={e => setVariantForm(p => ({ ...p, stock_quantity: e.target.value }))} className="input" placeholder="0" />
            </div>
            <div>
              <label className="label">Low Stock Alert</label>
              <input type="number" value={variantForm.low_stock_threshold} onChange={e => setVariantForm(p => ({ ...p, low_stock_threshold: e.target.value }))} className="input" placeholder="5" />
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Delete Confirm Modal ── */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete Product"
        size="sm"
        footer={
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowDeleteConfirm(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleDeleteProduct} disabled={saving} className="btn-danger">
              {saving ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        }
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            Deactivate <strong className="text-gray-900 dark:text-gray-100">{deleteTarget?.name}</strong>?
            It will immediately disappear from the POS, the online store, and this list —
            its variants and stock data are kept as-is, and it can be brought back later with
            "Show deactivated" + Reactivate.
          </p>
        </div>
      </Modal>

      {/* ── Delete Variant Confirm Modal ── */}
      <Modal
        isOpen={showDeleteVariantConfirm}
        onClose={() => setShowDeleteVariantConfirm(false)}
        title="Deactivate Variant"
        size="sm"
        footer={
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowDeleteVariantConfirm(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleDeleteVariant} disabled={saving} className="btn-danger">
              {saving ? 'Deactivating...' : 'Deactivate'}
            </button>
          </div>
        }
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            Deactivate <strong className="text-gray-900 dark:text-gray-100">
              {deleteVariantTarget?.variant?.sku || deleteVariantTarget?.variant?.size || 'this variant'}
            </strong>?
            It will immediately stop showing up for sale in the POS and online store — its price,
            cost, and stock quantity are kept as-is, and it can be brought back later with
            "Show deactivated" + Reactivate.
          </p>
        </div>
      </Modal>

      {/* ── Category Modal ── */}
      <Modal
        isOpen={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        title="Manage Categories"
        size="sm"
      >
        <div className="space-y-4">
          <form onSubmit={handleCreateCategory} className="flex gap-2">
            <input
              type="text"
              value={categoryName}
              onChange={e => setCategoryName(e.target.value)}
              placeholder="New category name"
              className="input flex-1"
            />
            <button type="submit" className="btn-primary flex-shrink-0">Add</button>
          </form>
          <div className="space-y-1">
            {categories.map(c => (
              <div key={c.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                <span className="text-sm text-gray-700 dark:text-gray-300">{c.name}</span>
              </div>
            ))}
            {categories.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No categories yet</p>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default ProductsPage;
