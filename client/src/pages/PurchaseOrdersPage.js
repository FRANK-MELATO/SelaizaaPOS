import React, { useState, useEffect, useCallback } from 'react';
import {
  Truck, Building2, Plus, Trash2, Eye, RefreshCw, CheckCircle,
  Clock, Package, Edit2, PackageCheck
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supplierService, productService } from '../services/api';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import Modal from '../components/common/Modal';
import Badge from '../components/common/Badge';
import StatCard from '../components/common/StatCard';
import LoadingSpinner from '../components/common/LoadingSpinner';
import DataTable from '../components/common/DataTable';

const PO_STATUSES = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'received', label: 'Received' },
  { id: 'cancelled', label: 'Cancelled' }
];

const STATUS_COLORS = { pending: 'yellow', received: 'green', cancelled: 'red' };

function StatusBadge({ status }) {
  return <Badge color={STATUS_COLORS[status] || 'gray'} dot size="sm">{status}</Badge>;
}

const emptyItemRow = { variant_id: '', quantity_ordered: '', unit_cost: '' };
const emptySupplierForm = { name: '', contact_person: '', phone: '', email: '', address: '' };

function PurchaseOrdersPage() {
  const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'suppliers'

  // Purchase orders
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  // Suppliers
  const [suppliers, setSuppliers] = useState([]);
  const [suppliersLoading, setSuppliersLoading] = useState(true);

  // Variant catalog for the "add item" picker on a new PO
  const [variants, setVariants] = useState([]);
  const [variantsLoaded, setVariantsLoaded] = useState(false);

  // New PO modal
  const [showNewPO, setShowNewPO] = useState(false);
  const [poSupplierId, setPoSupplierId] = useState('');
  const [poNotes, setPoNotes] = useState('');
  const [poItems, setPoItems] = useState([{ ...emptyItemRow }]);
  const [savingPO, setSavingPO] = useState(false);

  // PO detail / receive modal
  const [showDetail, setShowDetail] = useState(false);
  const [selectedPO, setSelectedPO] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [receiveQty, setReceiveQty] = useState({});
  const [receiving, setReceiving] = useState(false);

  // Supplier modal
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [supplierForm, setSupplierForm] = useState(emptySupplierForm);
  const [supplierErrors, setSupplierErrors] = useState({});
  const [savingSupplier, setSavingSupplier] = useState(false);

  // Fetch the full list (unfiltered) so the stat cards above always reflect
  // every order, and filter client-side for the table — filtering server-side
  // by status would leave the stats only describing whatever's on screen.
  const fetchOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const res = await supplierService.getPurchaseOrders({ limit: 100 });
      setOrders(Array.isArray(res?.data?.purchase_orders) ? res.data.purchase_orders : []);
    } catch {
      toast.error('Failed to load purchase orders');
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  const fetchSuppliers = useCallback(async () => {
    setSuppliersLoading(true);
    try {
      const res = await supplierService.getSuppliers();
      setSuppliers(Array.isArray(res?.data || res) ? (res?.data || res) : []);
    } catch {
      toast.error('Failed to load suppliers');
    } finally {
      setSuppliersLoading(false);
    }
  }, []);

  const fetchVariants = useCallback(async () => {
    try {
      const res = await productService.getProducts({});
      const products = Array.isArray(res?.data?.products) ? res.data.products : [];
      const flat = [];
      products.forEach(p => {
        (p.variants || []).forEach(v => {
          flat.push({
            variant_id: v.id,
            label: `${p.name}${[v.flavor, v.size].filter(Boolean).length ? ' - ' + [v.flavor, v.size].filter(Boolean).join(' ') : ''} (${v.sku})`,
            cost_price: v.cost_price
          });
        });
      });
      setVariants(flat);
      setVariantsLoaded(true);
    } catch {
      toast.error('Failed to load products');
    }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  const pendingCount = orders.filter(o => o.status === 'pending').length;
  const receivedSpend = orders
    .filter(o => o.status === 'received')
    .reduce((s, o) => s + (parseFloat(o.total_cost) || 0), 0);
  const filteredOrders = statusFilter === 'all' ? orders : orders.filter(o => o.status === statusFilter);

  // ── New PO ────────────────────────────────────────────────────────────────

  const openNewPO = () => {
    setPoSupplierId('');
    setPoNotes('');
    setPoItems([{ ...emptyItemRow }]);
    if (!variantsLoaded) fetchVariants();
    setShowNewPO(true);
  };

  const updateItemRow = (index, field, value) => {
    setPoItems(prev => prev.map((row, i) => {
      if (i !== index) return row;
      const next = { ...row, [field]: value };
      if (field === 'variant_id' && !row.unit_cost) {
        const variant = variants.find(v => String(v.variant_id) === String(value));
        if (variant?.cost_price) next.unit_cost = variant.cost_price;
      }
      return next;
    }));
  };

  const addItemRow = () => setPoItems(prev => [...prev, { ...emptyItemRow }]);
  const removeItemRow = (index) => setPoItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev);

  const poTotal = poItems.reduce((s, r) => s + (parseFloat(r.quantity_ordered) || 0) * (parseFloat(r.unit_cost) || 0), 0);

  const handleCreatePO = async () => {
    const validItems = poItems.filter(r => r.variant_id && r.quantity_ordered && r.unit_cost);
    if (validItems.length === 0) {
      toast.error('Add at least one item with quantity and unit cost');
      return;
    }
    setSavingPO(true);
    try {
      await supplierService.createPurchaseOrder({
        supplier_id: poSupplierId || null,
        notes: poNotes || null,
        items: validItems.map(r => ({
          variant_id: parseInt(r.variant_id),
          quantity_ordered: parseInt(r.quantity_ordered),
          unit_cost: parseFloat(r.unit_cost)
        }))
      });
      toast.success('Purchase order created');
      setShowNewPO(false);
      fetchOrders();
    } catch (err) {
      toast.error(err.message || 'Failed to create purchase order');
    } finally {
      setSavingPO(false);
    }
  };

  // ── Detail / Receive ─────────────────────────────────────────────────────

  const openDetail = async (order) => {
    setSelectedPO(order);
    setShowDetail(true);
    setDetailLoading(true);
    try {
      const res = await supplierService.getPurchaseOrder(order.id);
      const full = res?.data || res;
      setSelectedPO(full);
      const initialQty = {};
      (full.items || []).forEach(item => {
        initialQty[item.id] = item.quantity_received > 0 ? item.quantity_received : item.quantity_ordered;
      });
      setReceiveQty(initialQty);
    } catch {
      toast.error('Failed to load purchase order details');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleReceive = async () => {
    if (!selectedPO) return;
    setReceiving(true);
    try {
      await supplierService.receivePurchaseOrder(selectedPO.id, {
        items: (selectedPO.items || []).map(item => ({
          po_item_id: item.id,
          quantity_received: Math.max(0, parseInt(receiveQty[item.id]) || 0)
        }))
      });
      toast.success('Purchase order received — inventory updated');
      setShowDetail(false);
      fetchOrders();
    } catch (err) {
      toast.error(err.message || 'Failed to receive purchase order');
    } finally {
      setReceiving(false);
    }
  };

  // ── Suppliers ─────────────────────────────────────────────────────────────

  const openAddSupplier = () => {
    setEditingSupplier(null);
    setSupplierForm(emptySupplierForm);
    setSupplierErrors({});
    setShowSupplierModal(true);
  };

  const openEditSupplier = (supplier) => {
    setEditingSupplier(supplier);
    setSupplierForm({
      name: supplier.name || '',
      contact_person: supplier.contact_person || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || ''
    });
    setSupplierErrors({});
    setShowSupplierModal(true);
  };

  const handleSaveSupplier = async () => {
    if (!supplierForm.name.trim()) {
      setSupplierErrors({ name: 'Supplier name is required' });
      return;
    }
    setSavingSupplier(true);
    try {
      if (editingSupplier) {
        await supplierService.updateSupplier(editingSupplier.id, supplierForm);
        toast.success('Supplier updated');
      } else {
        await supplierService.createSupplier(supplierForm);
        toast.success('Supplier added');
      }
      setShowSupplierModal(false);
      fetchSuppliers();
    } catch (err) {
      toast.error(err.message || 'Failed to save supplier');
    } finally {
      setSavingSupplier(false);
    }
  };

  const orderColumns = [
    {
      key: 'po_number',
      label: 'PO #',
      render: (val, row) => (
        <div>
          <p className="font-mono font-semibold text-orange-600 dark:text-orange-400">{val}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{formatDateTime(row.created_at)}</p>
        </div>
      )
    },
    {
      key: 'supplier_name',
      label: 'Supplier',
      render: (val) => <span className="text-gray-700 dark:text-gray-300">{val || 'Unspecified'}</span>
    },
    {
      key: 'status',
      label: 'Status',
      render: (val) => <StatusBadge status={val} />
    },
    {
      key: 'total_cost',
      label: 'Total Cost',
      render: (val) => <span className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(val || 0)}</span>
    },
    {
      key: 'created_by_name',
      label: 'Created By',
      render: (val) => <span className="text-gray-500 dark:text-gray-400 text-xs">{val || '-'}</span>
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <button
          onClick={(e) => { e.stopPropagation(); openDetail(row); }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-lg transition-colors"
        >
          {row.status === 'pending' ? <PackageCheck className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {row.status === 'pending' ? 'Receive' : 'View'}
        </button>
      )
    }
  ];

  const supplierColumns = [
    {
      key: 'name',
      label: 'Supplier',
      render: (val, row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
            <Building2 className="h-4 w-4 text-blue-700 dark:text-blue-400" />
          </div>
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">{val}</p>
            {row.contact_person && <p className="text-xs text-gray-500 dark:text-gray-400">{row.contact_person}</p>}
          </div>
        </div>
      )
    },
    {
      key: 'phone',
      label: 'Phone',
      render: (val) => <span className="text-gray-600 dark:text-gray-400">{val || '-'}</span>
    },
    {
      key: 'email',
      label: 'Email',
      render: (val) => <span className="text-gray-600 dark:text-gray-400">{val || '-'}</span>
    },
    {
      key: 'total_orders',
      label: 'Orders',
      render: (val) => <span className="font-semibold text-gray-700 dark:text-gray-300">{val || 0}</span>
    },
    {
      key: 'actions',
      label: '',
      render: (_, row) => (
        <button
          onClick={(e) => { e.stopPropagation(); openEditSupplier(row); }}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <Edit2 className="h-4 w-4" />
        </button>
      )
    }
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Purchase Orders</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Restock inventory from your suppliers</p>
        </div>
        <div className="sm:ml-auto flex gap-2">
          <button onClick={() => (activeTab === 'orders' ? fetchOrders() : fetchSuppliers())} className="btn-secondary flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
          </button>
          {activeTab === 'orders' ? (
            <button onClick={openNewPO} className="btn-primary flex items-center gap-2">
              <Plus className="h-4 w-4" /> New Purchase Order
            </button>
          ) : (
            <button onClick={openAddSupplier} className="btn-primary flex items-center gap-2">
              <Plus className="h-4 w-4" /> Add Supplier
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 dark:bg-gray-700 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab('orders')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'orders' ? 'bg-white dark:bg-gray-600 shadow-sm text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          <Truck className="h-4 w-4" /> Purchase Orders
        </button>
        <button
          onClick={() => setActiveTab('suppliers')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'suppliers' ? 'bg-white dark:bg-gray-600 shadow-sm text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          <Building2 className="h-4 w-4" /> Suppliers
        </button>
      </div>

      {activeTab === 'orders' ? (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard icon={Truck} label="Total Purchase Orders" value={orders.length} color="orange" />
            <StatCard icon={Clock} label="Pending" value={pendingCount} color="yellow" />
            <StatCard icon={CheckCircle} label="Total Received Spend" value={formatCurrency(receivedSpend)} color="green" />
          </div>

          {/* Status filter */}
          <div className="flex gap-1.5 overflow-x-auto">
            {PO_STATUSES.map(s => (
              <button
                key={s.id}
                onClick={() => setStatusFilter(s.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  statusFilter === s.id
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="card overflow-hidden">
            {ordersLoading ? (
              <LoadingSpinner label="Loading purchase orders..." />
            ) : (
              <DataTable
                columns={orderColumns}
                data={filteredOrders}
                emptyMessage="No purchase orders yet"
                emptyIcon={<Truck className="h-12 w-12" />}
                onRowClick={openDetail}
                pageSize={12}
              />
            )}
          </div>
        </>
      ) : (
        <div className="card overflow-hidden">
          {suppliersLoading ? (
            <LoadingSpinner label="Loading suppliers..." />
          ) : (
            <DataTable
              columns={supplierColumns}
              data={suppliers}
              emptyMessage="No suppliers yet"
              emptyIcon={<Building2 className="h-12 w-12" />}
              onRowClick={openEditSupplier}
              pageSize={12}
            />
          )}
        </div>
      )}

      {/* ── New Purchase Order Modal ── */}
      <Modal
        isOpen={showNewPO}
        onClose={() => setShowNewPO(false)}
        title="New Purchase Order"
        size="lg"
        footer={
          <div className="flex items-center gap-3 justify-between w-full">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Total: <strong className="text-gray-900 dark:text-gray-100">{formatCurrency(poTotal)}</strong>
            </span>
            <div className="flex gap-3">
              <button onClick={() => setShowNewPO(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleCreatePO} disabled={savingPO} className="btn-primary">
                {savingPO ? 'Creating...' : 'Create Purchase Order'}
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Supplier (optional)</label>
            <select value={poSupplierId} onChange={e => setPoSupplierId(e.target.value)} className="input">
              <option value="">Unspecified</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Items</label>
              <button onClick={addItemRow} className="text-xs text-orange-600 dark:text-orange-400 font-medium flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" /> Add Item
              </button>
            </div>
            <div className="space-y-2">
              {poItems.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={row.variant_id}
                    onChange={e => updateItemRow(i, 'variant_id', e.target.value)}
                    className="input text-sm flex-1"
                  >
                    <option value="">{variantsLoaded ? 'Select product...' : 'Loading products...'}</option>
                    {variants.map(v => <option key={v.variant_id} value={v.variant_id}>{v.label}</option>)}
                  </select>
                  <input
                    type="number"
                    min="1"
                    placeholder="Qty"
                    value={row.quantity_ordered}
                    onChange={e => updateItemRow(i, 'quantity_ordered', e.target.value)}
                    className="input text-sm w-20"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Unit cost"
                    value={row.unit_cost}
                    onChange={e => updateItemRow(i, 'unit_cost', e.target.value)}
                    className="input text-sm w-28"
                  />
                  <button
                    onClick={() => removeItemRow(i)}
                    disabled={poItems.length === 1}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea value={poNotes} onChange={e => setPoNotes(e.target.value)} className="input resize-none h-16" placeholder="Optional notes..." />
          </div>
        </div>
      </Modal>

      {/* ── PO Detail / Receive Modal ── */}
      <Modal
        isOpen={showDetail}
        onClose={() => setShowDetail(false)}
        title={`Purchase Order ${selectedPO?.po_number || ''}`}
        size="lg"
        footer={
          selectedPO?.status === 'pending' && (
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowDetail(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleReceive} disabled={receiving} className="btn-primary flex items-center gap-2">
                <PackageCheck className="h-4 w-4" />
                {receiving ? 'Receiving...' : 'Mark Received & Update Stock'}
              </button>
            </div>
          )
        }
      >
        {detailLoading ? (
          <LoadingSpinner />
        ) : selectedPO ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <StatusBadge status={selectedPO.status} />
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {selectedPO.supplier_name || 'Unspecified supplier'}
              </span>
              <span className="text-xs text-gray-400 ml-auto">{formatDateTime(selectedPO.created_at)}</span>
            </div>

            {selectedPO.status === 'pending' && (
              <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                Confirm how many of each item actually arrived, then mark received — inventory quantities update automatically.
              </p>
            )}

            <div className="space-y-2">
              {(selectedPO.items || []).map(item => (
                <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{item.product_name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {[item.flavor, item.size].filter(Boolean).join(' · ')} · SKU {item.sku} · {formatCurrency(item.unit_cost)} each
                    </p>
                  </div>
                  {selectedPO.status === 'pending' ? (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-gray-400">Ordered {item.quantity_ordered} · Received</span>
                      <input
                        type="number"
                        min="0"
                        value={receiveQty[item.id] ?? item.quantity_ordered}
                        onChange={e => setReceiveQty(prev => ({ ...prev, [item.id]: e.target.value }))}
                        className="input text-sm w-20 py-1"
                      />
                    </div>
                  ) : (
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.quantity_received}/{item.quantity_ordered} received</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-between font-bold text-gray-900 dark:text-gray-100 border-t border-gray-200 dark:border-gray-700 pt-3">
              <span>Total Cost</span>
              <span className="text-orange-600 dark:text-orange-400">{formatCurrency(selectedPO.total_cost)}</span>
            </div>

            {selectedPO.notes && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-sm text-blue-700 dark:text-blue-400">
                <strong>Notes:</strong> {selectedPO.notes}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Package className="h-12 w-12 mb-2 opacity-30" />
            <p>Purchase order not found</p>
          </div>
        )}
      </Modal>

      {/* ── Add/Edit Supplier Modal ── */}
      <Modal
        isOpen={showSupplierModal}
        onClose={() => setShowSupplierModal(false)}
        title={editingSupplier ? 'Edit Supplier' : 'Add Supplier'}
        size="sm"
        footer={
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowSupplierModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSaveSupplier} disabled={savingSupplier} className="btn-primary">
              {savingSupplier ? 'Saving...' : editingSupplier ? 'Save Changes' : 'Add Supplier'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Supplier Name *</label>
            <input type="text" value={supplierForm.name} onChange={e => setSupplierForm(p => ({ ...p, name: e.target.value }))}
              className={`input ${supplierErrors.name ? 'input-error' : ''}`} placeholder="e.g. Maseru Fresh Produce" />
            {supplierErrors.name && <p className="error-text">{supplierErrors.name}</p>}
          </div>
          <div>
            <label className="label">Contact Person</label>
            <input type="text" value={supplierForm.contact_person} onChange={e => setSupplierForm(p => ({ ...p, contact_person: e.target.value }))}
              className="input" placeholder="Contact name" />
          </div>
          <div>
            <label className="label">Phone Number</label>
            <input type="tel" value={supplierForm.phone} onChange={e => setSupplierForm(p => ({ ...p, phone: e.target.value }))}
              className="input" placeholder="+266 50410310" />
          </div>
          <div>
            <label className="label">Email Address</label>
            <input type="email" value={supplierForm.email} onChange={e => setSupplierForm(p => ({ ...p, email: e.target.value }))}
              className="input" placeholder="supplier@example.com" />
          </div>
          <div>
            <label className="label">Address</label>
            <textarea value={supplierForm.address} onChange={e => setSupplierForm(p => ({ ...p, address: e.target.value }))}
              className="input resize-none h-20" placeholder="Supplier address..." />
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default PurchaseOrdersPage;
