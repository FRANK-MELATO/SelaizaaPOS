import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, UserPlus, Star, Gift, Phone, Mail, Edit2, Award,
  TrendingUp, ChevronRight, RefreshCw, Clock, ShoppingBag, Trash2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { customerService } from '../services/api';
import { formatCurrency, formatDate, formatDateTime, getLoyaltyTier, getNextTierInfo } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/common/Modal';
import Badge from '../components/common/Badge';
import SearchInput from '../components/common/SearchInput';
import StatCard from '../components/common/StatCard';
import LoadingSpinner from '../components/common/LoadingSpinner';
import DataTable from '../components/common/DataTable';

const TIERS = [
  { name: 'Bronze', color: 'amber', min: 0, max: 999 },
  { name: 'Silver', color: 'gray', min: 1000, max: 4999 },
  { name: 'Gold', color: 'yellow', min: 5000, max: Infinity }
];

const TIER_COLORS = { Bronze: 'amber', Silver: 'gray', Gold: 'yellow' };

const emptyForm = { name: '', phone: '', email: '', address: '' };

function CustomersPage() {
  const { isAdmin } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTier, setFilterTier] = useState('all');

  // Modals
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showPointsModal, setShowPointsModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerDetail, setCustomerDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [purchases, setPurchases] = useState([]);
  const [pointsHistory, setPointsHistory] = useState([]);

  // Form
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [pointsAdjust, setPointsAdjust] = useState({ amount: '', reason: '', type: 'add' });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (searchQuery) params.search = searchQuery;
      const res = await customerService.getCustomers(params);
      setCustomers(Array.isArray(res?.data?.customers) ? res.data.customers : []);
    } catch {
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const openDetail = async (customer) => {
    setSelectedCustomer(customer);
    setShowDetailModal(true);
    setDetailLoading(true);
    try {
      const [detRes, purRes] = await Promise.all([
        customerService.getLoyaltyInfo(customer.id),
        customerService.getPurchaseHistory(customer.id, { limit: 10 })
      ]);
      setCustomerDetail(detRes?.data || detRes);
      setPurchases(Array.isArray(purRes?.data || purRes) ? (purRes?.data || purRes) : []);
    } catch {
      toast.error('Failed to load customer details');
    } finally {
      setDetailLoading(false);
    }
  };

  const openAdd = () => {
    setEditingCustomer(null);
    setForm(emptyForm);
    setFormErrors({});
    setShowCustomerModal(true);
  };

  const openEdit = (customer) => {
    setEditingCustomer(customer);
    setForm({
      name: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || ''
    });
    setFormErrors({});
    setShowCustomerModal(true);
  };

  const validateForm = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (form.email && !/\S+@\S+\.\S+/.test(form.email)) errs.email = 'Invalid email';
    return errs;
  };

  const handleSave = async () => {
    const errs = validateForm();
    if (Object.keys(errs).length) { setFormErrors(errs); return; }
    setSaving(true);
    try {
      if (editingCustomer) {
        await customerService.updateCustomer(editingCustomer.id, form);
        toast.success('Customer updated');
      } else {
        await customerService.createCustomer(form);
        toast.success('Customer added');
      }
      setShowCustomerModal(false);
      fetchCustomers();
    } catch (err) {
      toast.error(err.message || 'Failed to save customer');
    } finally {
      setSaving(false);
    }
  };

  const handlePointsAdjust = async () => {
    if (!pointsAdjust.amount || !pointsAdjust.reason.trim()) {
      toast.error('Points amount and reason are required');
      return;
    }
    setSaving(true);
    try {
      const points_change = pointsAdjust.type === 'remove'
        ? -Math.abs(parseInt(pointsAdjust.amount))
        : Math.abs(parseInt(pointsAdjust.amount));
      await customerService.adjustPoints(selectedCustomer.id, { points_change, notes: pointsAdjust.reason });
      toast.success('Points adjusted');
      setShowPointsModal(false);
      fetchCustomers();
      if (showDetailModal) openDetail(selectedCustomer);
    } catch (err) {
      toast.error(err.message || 'Failed to adjust points');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCustomer = async () => {
    if (!deleteTarget) return;
    try {
      await customerService.deleteCustomer(deleteTarget.id);
      toast.success('Customer deleted');
      setShowDeleteConfirm(false);
      setDeleteTarget(null);
      fetchCustomers();
    } catch (err) {
      toast.error(err.message || 'Failed to delete customer');
    }
  };

  const filteredCustomers = customers.filter(c => {
    const tier = getLoyaltyTier(c.total_spent || 0);
    return filterTier === 'all' || tier === filterTier;
  });

  const totalCustomers = customers.length;
  const goldCount = customers.filter(c => getLoyaltyTier(c.total_spent || 0) === 'Gold').length;
  const totalPoints = customers.reduce((s, c) => s + (c.loyalty_points || 0), 0);
  const totalSpend = customers.reduce((s, c) => s + (parseFloat(c.total_spent) || 0), 0);

  const columns = [
    {
      key: 'name',
      label: 'Customer',
      render: (val, row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center flex-shrink-0">
            <span className="text-orange-700 dark:text-orange-400 font-bold text-sm">{val?.[0]?.toUpperCase()}</span>
          </div>
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">{val}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{row.email || row.phone}</p>
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
      key: 'loyalty_tier',
      label: 'Tier',
      render: (_, row) => {
        const tier = getLoyaltyTier(row.total_spent || 0);
        return <Badge color={TIER_COLORS[tier]} size="sm" dot>{tier}</Badge>;
      }
    },
    {
      key: 'loyalty_points',
      label: 'Points',
      render: (val) => (
        <span className="font-semibold text-purple-600 dark:text-purple-400">{val || 0}</span>
      )
    },
    {
      key: 'total_spent',
      label: 'Total Spent',
      render: (val) => <span className="font-medium text-gray-700 dark:text-gray-300">{formatCurrency(val || 0)}</span>
    },
    {
      key: 'created_at',
      label: 'Joined',
      render: (val) => <span className="text-gray-500 dark:text-gray-400 text-xs">{formatDate(val)}</span>
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); openDetail(row); }}
            className="p-1.5 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
            title="View details"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); openEdit(row); }}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <Edit2 className="h-4 w-4" />
          </button>
          {isAdmin && (
            <button
              onClick={(e) => { e.stopPropagation(); setDeleteTarget(row); setShowDeleteConfirm(true); }}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              title="Delete customer"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Customers</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Manage customers and loyalty program</p>
        </div>
        <div className="sm:ml-auto flex gap-2">
          <button onClick={fetchCustomers} className="btn-secondary flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button onClick={openAdd} className="btn-primary flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Add Customer
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Total Customers" value={totalCustomers} color="orange" />
        <StatCard icon={Award} label="Gold Members" value={goldCount} color="yellow" />
        <StatCard icon={Star} label="Total Points" value={totalPoints.toLocaleString()} color="purple" />
        <StatCard icon={TrendingUp} label="Total Revenue" value={formatCurrency(totalSpend)} color="green" />
      </div>

      {/* Tier legend */}
      <div className="flex gap-3 flex-wrap">
        {TIERS.map(t => (
          <button
            key={t.name}
            onClick={() => setFilterTier(filterTier === t.name ? 'all' : t.name)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              filterTier === t.name
                ? 'ring-2 ring-offset-1 ring-orange-500'
                : ''
            }`}
          >
            <Badge color={t.color} size="sm">{t.name}</Badge>
            <span className="text-gray-500 dark:text-gray-400">M{t.min}–{t.max === Infinity ? '+' : `M${t.max}`}</span>
          </button>
        ))}
        {filterTier !== 'all' && (
          <button onClick={() => setFilterTier('all')} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1">Clear filter</button>
        )}
      </div>

      {/* Search */}
      <SearchInput
        placeholder="Search by name, phone, or email..."
        value={searchQuery}
        onChange={setSearchQuery}
      />

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <LoadingSpinner label="Loading customers..." />
        ) : (
          <DataTable
            columns={columns}
            data={filteredCustomers}
            emptyMessage="No customers found"
            emptyIcon={<Users className="h-12 w-12" />}
            onRowClick={openDetail}
            pageSize={12}
          />
        )}
      </div>

      {/* ── Add/Edit Customer Modal ── */}
      <Modal
        isOpen={showCustomerModal}
        onClose={() => setShowCustomerModal(false)}
        title={editingCustomer ? 'Edit Customer' : 'Add Customer'}
        size="sm"
        footer={
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowCustomerModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : editingCustomer ? 'Save Changes' : 'Add Customer'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Full Name *</label>
            <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className={`input ${formErrors.name ? 'input-error' : ''}`} placeholder="John Doe" />
            {formErrors.name && <p className="error-text">{formErrors.name}</p>}
          </div>
          <div>
            <label className="label">Phone Number</label>
            <input type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
              className="input" placeholder="+266 50410310" />
          </div>
          <div>
            <label className="label">Email Address</label>
            <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              className={`input ${formErrors.email ? 'input-error' : ''}`} placeholder="john@example.com" />
            {formErrors.email && <p className="error-text">{formErrors.email}</p>}
          </div>
          <div>
            <label className="label">Address</label>
            <textarea value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
              className="input resize-none h-20" placeholder="Delivery address..." />
          </div>
        </div>
      </Modal>

      {/* ── Customer Detail Modal ── */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title={selectedCustomer?.name}
        size="lg"
        footer={
          <div className="flex gap-2">
            {isAdmin && (
              <button
                onClick={() => { setShowPointsModal(true); }}
                className="flex items-center gap-2 btn-secondary"
              >
                <Gift className="h-4 w-4" /> Adjust Points
              </button>
            )}
            <button
              onClick={() => { setShowDetailModal(false); openEdit(selectedCustomer); }}
              className="flex items-center gap-2 btn-secondary ml-auto"
            >
              <Edit2 className="h-4 w-4" /> Edit
            </button>
          </div>
        }
      >
        {detailLoading ? (
          <LoadingSpinner />
        ) : (
          <div className="space-y-6">
            {/* Profile */}
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center flex-shrink-0">
                <span className="text-3xl font-bold text-orange-700 dark:text-orange-400">
                  {selectedCustomer?.name?.[0]?.toUpperCase()}
                </span>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">{selectedCustomer?.name}</h3>
                <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {selectedCustomer?.phone && (
                    <span className="flex items-center gap-1"><Phone className="h-4 w-4" />{selectedCustomer.phone}</span>
                  )}
                  {selectedCustomer?.email && (
                    <span className="flex items-center gap-1"><Mail className="h-4 w-4" />{selectedCustomer.email}</span>
                  )}
                </div>
                <div className="mt-2">
                  {(() => {
                    const tier = getLoyaltyTier(selectedCustomer?.total_spent || 0);
                    return <Badge color={TIER_COLORS[tier]} size="md" dot>{tier} Member</Badge>;
                  })()}
                </div>
              </div>
            </div>

            {/* Loyalty */}
            <div className="p-4 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-xl border border-purple-100 dark:border-purple-800">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  <span className="font-semibold text-purple-800 dark:text-purple-300">Loyalty Points</span>
                </div>
                <span className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                  {(customerDetail?.loyalty_points ?? selectedCustomer?.loyalty_points) || 0}
                </span>
              </div>
              {(() => {
                const info = getNextTierInfo(selectedCustomer?.total_spent || 0);
                return info.progress < 100 ? (
                  <div>
                    <div className="flex justify-between text-xs text-purple-600 dark:text-purple-400 mb-1">
                      <span>Progress to {info.next}</span>
                      <span>{Math.round(info.progress)}%</span>
                    </div>
                    <div className="h-2 bg-purple-200 dark:bg-purple-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-600 rounded-full transition-all"
                        style={{ width: `${info.progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-purple-500 dark:text-purple-400 mt-1">
                      {formatCurrency(info.threshold - info.current)} more to {info.next}
                    </p>
                  </div>
                ) : (
                  <div className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">
                    🏆 Gold Member! Maximum tier achieved.
                  </div>
                );
              })()}
              <div className="mt-3 text-sm text-purple-700 dark:text-purple-300">
                Total Spent: <strong>{formatCurrency(selectedCustomer?.total_spent || 0)}</strong>
              </div>
            </div>

            {/* Recent Purchases */}
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-gray-500" />
                Recent Purchases
              </h4>
              {purchases.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No purchases yet</p>
              ) : (
                <div className="space-y-2">
                  {purchases.map((p, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-700/50">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {p.sale_number || `Sale #${p.id}`}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {formatDate(p.created_at)} · {p.items_count || 0} items
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(p.total_amount)}</p>
                        {p.points_earned > 0 && (
                          <p className="text-xs text-purple-500">+{p.points_earned} pts</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ── Delete Confirmation Modal ── */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => { setShowDeleteConfirm(false); setDeleteTarget(null); }}
        title="Delete Customer"
        size="sm"
        footer={
          <div className="flex gap-3 justify-end">
            <button onClick={() => { setShowDeleteConfirm(false); setDeleteTarget(null); }} className="btn-secondary">Cancel</button>
            <button onClick={handleDeleteCustomer} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors">
              Delete
            </button>
          </div>
        }
      >
        <p className="text-gray-600 dark:text-gray-400">
          Are you sure you want to delete <strong className="text-gray-900 dark:text-gray-100">{deleteTarget?.name}</strong>?
          This cannot be undone. Customers with completed sales cannot be deleted.
        </p>
      </Modal>

      {/* ── Points Adjustment Modal ── */}
      <Modal
        isOpen={showPointsModal}
        onClose={() => setShowPointsModal(false)}
        title={`Adjust Points – ${selectedCustomer?.name}`}
        size="sm"
        footer={
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowPointsModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handlePointsAdjust} disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : 'Apply'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-sm text-gray-600 dark:text-gray-400">
            Current Balance: <strong className="text-purple-600 dark:text-purple-400">{selectedCustomer?.loyalty_points || 0} points</strong>
          </div>
          <div>
            <label className="label">Type</label>
            <div className="flex gap-2">
              <button
                onClick={() => setPointsAdjust(p => ({ ...p, type: 'add' }))}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pointsAdjust.type === 'add'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                + Add Points
              </button>
              <button
                onClick={() => setPointsAdjust(p => ({ ...p, type: 'remove' }))}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pointsAdjust.type === 'remove'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                - Remove Points
              </button>
            </div>
          </div>
          <div>
            <label className="label">Points Amount</label>
            <input
              type="number"
              min="1"
              value={pointsAdjust.amount}
              onChange={e => setPointsAdjust(p => ({ ...p, amount: e.target.value }))}
              className="input"
              placeholder="e.g. 100"
            />
          </div>
          <div>
            <label className="label">Reason *</label>
            <input
              type="text"
              value={pointsAdjust.reason}
              onChange={e => setPointsAdjust(p => ({ ...p, reason: e.target.value }))}
              className="input"
              placeholder="e.g. Manual adjustment, promotion, etc."
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default CustomersPage;
