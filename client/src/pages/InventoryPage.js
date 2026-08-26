import React, { useState, useEffect, useCallback } from 'react';
import {
  Archive, AlertTriangle, XCircle, DollarSign, RefreshCw,
  ClipboardList, History, TrendingDown, TrendingUp, Package
} from 'lucide-react';
import toast from 'react-hot-toast';
import { inventoryService } from '../services/api';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import Modal from '../components/common/Modal';
import Badge from '../components/common/Badge';
import SearchInput from '../components/common/SearchInput';
import StatCard from '../components/common/StatCard';
import LoadingSpinner from '../components/common/LoadingSpinner';
import DataTable from '../components/common/DataTable';

const ADJUSTMENT_TYPES = [
  { value: 'adjustment', label: 'Adjustment (add/remove stock)' },
  { value: 'write-off', label: 'Write-Off (damaged/expired)' }
];

function InventoryPage() {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [valuation, setValuation] = useState(null);

  // Modals
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Form
  const [adjustForm, setAdjustForm] = useState({ type: 'adjustment', quantity: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (searchQuery) params.search = searchQuery;
      if (filter !== 'all') params.filter = filter;
      const res = await inventoryService.getInventory(params);
      setInventory(Array.isArray(res?.data?.inventory) ? res.data.inventory : []);
    } catch {
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, filter]);

  const fetchValuation = useCallback(async () => {
    try {
      const res = await inventoryService.getValuation();
      setValuation(res?.data || res);
    } catch {}
  }, []);

  useEffect(() => { fetchInventory(); }, [fetchInventory]);
  useEffect(() => { fetchValuation(); }, [fetchValuation]);

  const totalSKUs = inventory.length;
  const lowStockItems = inventory.filter(i => i.quantity > 0 && i.quantity <= (i.low_stock_threshold || 5)).length;
  const outOfStock = inventory.filter(i => i.quantity <= 0).length;

  const openAdjust = (variant) => {
    setSelectedVariant(variant);
    setAdjustForm({ type: 'adjustment', quantity: '', reason: '' });
    setFormErrors({});
    setShowAdjustModal(true);
  };

  const openHistory = async (variant) => {
    setSelectedVariant(variant);
    setShowHistoryModal(true);
    setHistoryLoading(true);
    try {
      const res = await inventoryService.getHistory(variant.id);
      setHistory(Array.isArray(res?.data || res) ? (res?.data || res) : []);
    } catch {
      toast.error('Failed to load history');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleAdjust = async () => {
    const errs = {};
    if (!adjustForm.quantity || Number(adjustForm.quantity) === 0) errs.quantity = 'Quantity is required';
    if (!adjustForm.reason.trim()) errs.reason = 'Reason is required';
    if (Object.keys(errs).length) { setFormErrors(errs); return; }

    setSaving(true);
    try {
      const payload = {
        quantity: parseInt(adjustForm.quantity),
        reason: adjustForm.reason,
        type: adjustForm.type
      };
      if (adjustForm.type === 'write-off') {
        await inventoryService.writeOff(selectedVariant.id, { ...payload, quantity: Math.abs(payload.quantity) });
      } else {
        await inventoryService.adjustStock(selectedVariant.id, payload);
      }
      toast.success('Stock adjusted successfully');
      setShowAdjustModal(false);
      fetchInventory();
      fetchValuation();
    } catch (err) {
      toast.error(err.message || 'Failed to adjust stock');
    } finally {
      setSaving(false);
    }
  };

  const getStockStatus = (item) => {
    if (item.quantity <= 0) return { label: 'Out of Stock', color: 'red' };
    if (item.quantity <= (item.low_stock_threshold || 5)) return { label: 'Low Stock', color: 'yellow' };
    return { label: 'In Stock', color: 'green' };
  };

  const columns = [
    {
      key: 'product_name',
      label: 'Product',
      render: (val, row) => (
        <div>
          <p className="font-medium text-gray-900 dark:text-gray-100">{val || row.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{row.sku}</p>
        </div>
      )
    },
    {
      key: 'flavor',
      label: 'Variant',
      render: (val, row) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {[row.flavor, row.size].filter(Boolean).join(' · ') || '-'}
        </span>
      )
    },
    {
      key: 'quantity',
      label: 'Stock',
      render: (val, row) => (
        <span className={`font-bold text-base ${
          val <= 0 ? 'text-red-600 dark:text-red-400' :
          val <= (row.low_stock_threshold || 5) ? 'text-yellow-600 dark:text-yellow-400' :
          'text-gray-900 dark:text-gray-100'
        }`}>
          {val ?? 0}
        </span>
      )
    },
    {
      key: 'low_stock_threshold',
      label: 'Threshold',
      render: (val) => <span className="text-gray-500 dark:text-gray-400">{val || 5}</span>
    },
    {
      key: 'price',
      label: 'Price',
      render: (val) => <span className="font-medium text-gray-700 dark:text-gray-300">{formatCurrency(val)}</span>
    },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => {
        const s = getStockStatus(row);
        return <Badge color={s.color} size="sm" dot>{s.label}</Badge>;
      }
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); openAdjust(row); }}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 hover:bg-orange-100 rounded-lg transition-colors"
          >
            <ClipboardList className="h-3 w-3" /> Adjust
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); openHistory(row); }}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
          >
            <History className="h-3 w-3" /> History
          </button>
        </div>
      )
    }
  ];

  const filteredInventory = inventory.filter(item => {
    const matchSearch = !searchQuery ||
      (item.product_name || item.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.sku || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchFilter = filter === 'all' ||
      (filter === 'low_stock' && item.quantity > 0 && item.quantity <= (item.low_stock_threshold || 5)) ||
      (filter === 'out_of_stock' && item.quantity <= 0);
    return matchSearch && matchFilter;
  });

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Inventory</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Track and manage stock levels</p>
        </div>
        <button onClick={fetchInventory} className="sm:ml-auto btn-secondary flex items-center gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Archive} label="Total SKUs" value={totalSKUs} color="orange" />
        <StatCard icon={AlertTriangle} label="Low Stock" value={lowStockItems} color="yellow" />
        <StatCard icon={XCircle} label="Out of Stock" value={outOfStock} color="red" />
        <StatCard
          icon={DollarSign}
          label="Inventory Value"
          value={valuation ? formatCurrency(valuation.total_value || 0) : '...'}
          color="green"
        />
      </div>

      {/* Low stock banner */}
      {lowStockItems > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl">
          <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
              {lowStockItems} item{lowStockItems !== 1 ? 's' : ''} running low on stock
            </p>
            <p className="text-xs text-yellow-700 dark:text-yellow-400">Consider restocking soon</p>
          </div>
          <button
            onClick={() => setFilter('low_stock')}
            className="ml-auto text-xs font-medium text-yellow-700 dark:text-yellow-400 underline"
          >
            View Low Stock
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput
          placeholder="Search by product name or SKU..."
          value={searchQuery}
          onChange={setSearchQuery}
          className="flex-1"
        />
        <div className="flex gap-2">
          {['all', 'low_stock', 'out_of_stock'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0 ${
                filter === f
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {f === 'all' ? 'All' : f === 'low_stock' ? 'Low Stock' : 'Out of Stock'}
            </button>
          ))}
        </div>
      </div>

      {/* Inventory table */}
      <div className="card overflow-hidden">
        {loading ? (
          <LoadingSpinner label="Loading inventory..." />
        ) : (
          <DataTable
            columns={columns}
            data={filteredInventory}
            emptyMessage="No inventory items found"
            emptyIcon={<Package className="h-12 w-12" />}
            pageSize={15}
          />
        )}
      </div>

      {/* ── Adjust Stock Modal ── */}
      <Modal
        isOpen={showAdjustModal}
        onClose={() => setShowAdjustModal(false)}
        title="Adjust Stock"
        size="sm"
        footer={
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowAdjustModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleAdjust} disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : 'Apply Adjustment'}
            </button>
          </div>
        }
      >
        {selectedVariant && (
          <div className="space-y-4">
            <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
              <p className="font-semibold text-gray-900 dark:text-gray-100">{selectedVariant.product_name || selectedVariant.name}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {[selectedVariant.flavor, selectedVariant.size].filter(Boolean).join(' · ')}
                {selectedVariant.sku && ` · ${selectedVariant.sku}`}
              </p>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-1">
                Current Stock: <span className="text-orange-600 dark:text-orange-400 font-bold">{selectedVariant.quantity}</span>
              </p>
            </div>

            <div>
              <label className="label">Adjustment Type</label>
              <select
                value={adjustForm.type}
                onChange={e => setAdjustForm(p => ({ ...p, type: e.target.value }))}
                className="input"
              >
                {ADJUSTMENT_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">
                Quantity
                {adjustForm.type === 'adjustment' && (
                  <span className="text-xs text-gray-400 ml-1">(use negative to reduce)</span>
                )}
              </label>
              <input
                type="number"
                value={adjustForm.quantity}
                onChange={e => setAdjustForm(p => ({ ...p, quantity: e.target.value }))}
                className={`input ${formErrors.quantity ? 'input-error' : ''}`}
                placeholder={adjustForm.type === 'write-off' ? 'Qty to write off (positive)' : '+10 or -5'}
              />
              {formErrors.quantity && <p className="error-text">{formErrors.quantity}</p>}
              {adjustForm.quantity && !isNaN(adjustForm.quantity) && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  New stock: {selectedVariant.quantity + (adjustForm.type === 'write-off' ? -Math.abs(parseInt(adjustForm.quantity)) : parseInt(adjustForm.quantity))}
                </p>
              )}
            </div>

            <div>
              <label className="label">Reason *</label>
              <textarea
                value={adjustForm.reason}
                onChange={e => setAdjustForm(p => ({ ...p, reason: e.target.value }))}
                className={`input resize-none h-20 ${formErrors.reason ? 'input-error' : ''}`}
                placeholder="Reason for adjustment..."
              />
              {formErrors.reason && <p className="error-text">{formErrors.reason}</p>}
            </div>
          </div>
        )}
      </Modal>

      {/* ── History Modal ── */}
      <Modal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        title={`Stock History – ${selectedVariant?.product_name || selectedVariant?.name || ''}`}
        size="lg"
      >
        {historyLoading ? (
          <LoadingSpinner label="Loading history..." />
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-gray-400">
            <History className="h-12 w-12 mb-2 opacity-30" />
            <p>No stock history found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((entry, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  entry.quantity_change > 0
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                }`}>
                  {entry.quantity_change > 0
                    ? <TrendingUp className="h-4 w-4" />
                    : <TrendingDown className="h-4 w-4" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`font-semibold ${entry.quantity_change > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {entry.quantity_change > 0 ? '+' : ''}{entry.quantity_change} units
                    </span>
                    <span className="text-xs text-gray-400">{formatDateTime(entry.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{entry.reason}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    <span>Type: <span className="capitalize">{entry.type}</span></span>
                    {entry.stock_after !== undefined && (
                      <span>Stock after: {entry.stock_after}</span>
                    )}
                    {entry.user_name && <span>By: {entry.user_name}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

export default InventoryPage;
