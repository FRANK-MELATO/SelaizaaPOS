import React, { useState, useEffect, useCallback } from 'react';
import {
  ShoppingBag, Eye, RefreshCw, Clock, Check, Truck,
  XCircle, Package, LayoutGrid, List, Phone, MapPin, User, Bell
} from 'lucide-react';
import toast from 'react-hot-toast';
import { onlineOrderService } from '../services/api';
import { formatCurrency, formatDateTime, getStatusColor } from '../utils/formatters';
import Modal from '../components/common/Modal';
import Badge from '../components/common/Badge';
import DataTable from '../components/common/DataTable';
import LoadingSpinner from '../components/common/LoadingSpinner';
import SearchInput from '../components/common/SearchInput';

const ORDER_STATUSES = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'processing', label: 'Processing' },
  { id: 'shipped', label: 'Shipped' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'cancelled', label: 'Cancelled' }
];

const STATUS_FLOW = {
  pending: { next: 'confirmed', label: 'Confirm Order', icon: Check, color: 'blue' },
  confirmed: { next: 'processing', label: 'Start Processing', icon: Package, color: 'orange' },
  processing: { next: 'shipped', label: 'Mark Shipped', icon: Truck, color: 'purple' },
  shipped: { next: 'delivered', label: 'Mark Delivered', icon: Check, color: 'green' }
};

function StatusBadge({ status }) {
  const colorMap = {
    pending: 'yellow', confirmed: 'blue', processing: 'orange',
    shipped: 'purple', delivered: 'green', cancelled: 'red'
  };
  return <Badge color={colorMap[status] || 'gray'} dot size="sm">{status?.replace('_', ' ')}</Badge>;
}

function OnlineOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'kanban'
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (searchQuery) params.search = searchQuery;
      const res = await onlineOrderService.getOrders(params);
      setOrders(Array.isArray(res?.data?.orders) ? res.data.orders : []);
    } catch {
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(fetchOrders, 60000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const openDetail = async (order) => {
    setSelectedOrder(order);
    setShowDetail(true);
    // Optionally fetch full detail
    try {
      const res = await onlineOrderService.getOrder(order.id);
      setSelectedOrder(res?.data || res);
    } catch {}
  };

  const handleUpdateStatus = async (order, newStatus) => {
    setUpdatingStatus(true);
    try {
      await onlineOrderService.updateStatus(order.id, newStatus);
      toast.success(`Order ${newStatus}`);
      fetchOrders();
      if (showDetail) {
        setSelectedOrder(prev => ({ ...prev, status: newStatus }));
      }
    } catch (err) {
      toast.error(err.message || 'Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) { toast.error('Cancellation reason required'); return; }
    setUpdatingStatus(true);
    try {
      await onlineOrderService.cancelOrder(selectedOrder.id, cancelReason);
      toast.success('Order cancelled');
      setShowCancelModal(false);
      setShowDetail(false);
      fetchOrders();
    } catch (err) {
      toast.error(err.message || 'Failed to cancel order');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const pendingCount = orders.filter(o => o.status === 'pending').length;

  const filteredOrders = orders.filter(o => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (o.order_number || '').toLowerCase().includes(q) ||
      (o.customer_name || '').toLowerCase().includes(q) ||
      (o.customer_phone || '').toLowerCase().includes(q)
    );
  });

  const columns = [
    {
      key: 'order_number',
      label: 'Order #',
      render: (val, row) => (
        <div>
          <p className="font-mono font-semibold text-orange-600 dark:text-orange-400">#{val || row.id}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{formatDateTime(row.created_at)}</p>
        </div>
      )
    },
    {
      key: 'customer_name',
      label: 'Customer',
      render: (val, row) => (
        <div>
          <p className="font-medium text-gray-900 dark:text-gray-100">{val || 'Guest'}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <Phone className="h-3 w-3" />{row.customer_phone || '-'}
          </p>
        </div>
      )
    },
    {
      key: 'items_count',
      label: 'Items',
      render: (val, row) => (
        <span className="text-gray-700 dark:text-gray-300">
          {val != null ? val : (row.items?.length ?? 0)} items
        </span>
      )
    },
    {
      key: 'total',
      label: 'Total',
      render: (val) => <span className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(val)}</span>
    },
    {
      key: 'payment_method',
      label: 'Payment',
      render: (val) => <span className="capitalize text-sm text-gray-600 dark:text-gray-400">{(val || '').replace('_', ' ')}</span>
    },
    {
      key: 'status',
      label: 'Status',
      render: (val) => <StatusBadge status={val} />
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => {
        const flow = STATUS_FLOW[row.status];
        return (
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); openDetail(row); }}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Eye className="h-4 w-4" />
            </button>
            {flow && (
              <button
                onClick={(e) => { e.stopPropagation(); handleUpdateStatus(row, flow.next); }}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition-colors bg-${flow.color}-50 dark:bg-${flow.color}-900/20 text-${flow.color}-700 dark:text-${flow.color}-400 hover:bg-${flow.color}-100`}
                disabled={updatingStatus}
              >
                <flow.icon className="h-3 w-3" />
                {flow.label.split(' ')[1]}
              </button>
            )}
          </div>
        );
      }
    }
  ];

  // Group orders by status for kanban
  const kanbanGroups = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'].map(status => ({
    status,
    orders: filteredOrders.filter(o => o.status === status)
  }));

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              Online Orders
              {pendingCount > 0 && (
                <span className="flex items-center gap-1 text-sm bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full">
                  <Bell className="h-3.5 w-3.5" />
                  {pendingCount} new
                </span>
              )}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Manage customer online orders</p>
          </div>
        </div>
        <div className="sm:ml-auto flex gap-2">
          {/* View mode toggle */}
          <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'table' ? 'bg-white dark:bg-gray-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'kanban' ? 'bg-white dark:bg-gray-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
          <button onClick={fetchOrders} className="btn-secondary flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput
          placeholder="Search by order #, name, phone..."
          value={searchQuery}
          onChange={setSearchQuery}
          className="flex-1"
        />
        <div className="flex gap-1.5 overflow-x-auto">
          {ORDER_STATUSES.map(s => (
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
              {s.id !== 'all' && (
                <span className="ml-1 opacity-70">
                  ({orders.filter(o => o.status === s.id).length})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <LoadingSpinner label="Loading orders..." />
      ) : viewMode === 'table' ? (
        <div className="card overflow-hidden">
          <DataTable
            columns={columns}
            data={filteredOrders}
            emptyMessage="No orders found"
            emptyIcon={<ShoppingBag className="h-12 w-12" />}
            onRowClick={openDetail}
            pageSize={12}
          />
        </div>
      ) : (
        // Kanban view
        <div className="flex gap-4 overflow-x-auto pb-4">
          {kanbanGroups.map(group => (
            <div key={group.status} className="flex-shrink-0 w-72">
              <div className="flex items-center gap-2 mb-3">
                <StatusBadge status={group.status} />
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400 ml-1">
                  ({group.orders.length})
                </span>
              </div>
              <div className="space-y-3">
                {group.orders.map(order => (
                  <div
                    key={order.id}
                    className="card p-3 cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => openDetail(order)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <p className="font-mono text-sm font-semibold text-orange-600 dark:text-orange-400">
                        #{order.order_number || order.id}
                      </p>
                      <span className="text-xs text-gray-400">{formatDateTime(order.created_at)}</span>
                    </div>
                    <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">{order.customer_name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{order.customer_phone}</p>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                      <span className="text-xs text-gray-500 dark:text-gray-400">{order.items?.length || 0} items</span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{formatCurrency(order.total)}</span>
                    </div>
                    {STATUS_FLOW[order.status] && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleUpdateStatus(order, STATUS_FLOW[order.status].next); }}
                        className="mt-2 w-full py-1.5 text-xs font-medium bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 rounded-lg hover:bg-orange-100 transition-colors flex items-center justify-center gap-1"
                      >
                        {STATUS_FLOW[order.status].label}
                      </button>
                    )}
                  </div>
                ))}
                {group.orders.length === 0 && (
                  <div className="text-center py-6 text-gray-400 text-xs border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                    No orders
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Order Detail Modal ── */}
      <Modal
        isOpen={showDetail}
        onClose={() => setShowDetail(false)}
        title={`Order #${selectedOrder?.order_number || selectedOrder?.id}`}
        size="lg"
        footer={
          selectedOrder && (
            <div className="flex items-center gap-2 flex-wrap">
              {selectedOrder.status !== 'cancelled' && selectedOrder.status !== 'delivered' && (
                <button
                  onClick={() => setShowCancelModal(true)}
                  className="btn-danger flex items-center gap-2"
                >
                  <XCircle className="h-4 w-4" /> Cancel Order
                </button>
              )}
              {STATUS_FLOW[selectedOrder?.status] && (
                <button
                  onClick={() => handleUpdateStatus(selectedOrder, STATUS_FLOW[selectedOrder.status].next)}
                  disabled={updatingStatus}
                  className="ml-auto btn-primary flex items-center gap-2"
                >
                  {updatingStatus ? 'Updating...' : STATUS_FLOW[selectedOrder.status].label}
                </button>
              )}
            </div>
          )
        }
      >
        {selectedOrder && (
          <div className="space-y-5">
            {/* Status + dates */}
            <div className="flex items-center gap-3 flex-wrap">
              <StatusBadge status={selectedOrder.status} />
              <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <Clock className="h-3.5 w-3.5" />
                Placed {formatDateTime(selectedOrder.created_at)}
              </div>
            </div>

            {/* Customer info */}
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl space-y-2">
              <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm flex items-center gap-2">
                <User className="h-4 w-4 text-gray-500" /> Customer Info
              </h4>
              <p className="font-medium text-gray-900 dark:text-gray-100">{selectedOrder.customer_name}</p>
              {selectedOrder.customer_phone && (
                <p className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Phone className="h-4 w-4" />{selectedOrder.customer_phone}
                </p>
              )}
              {selectedOrder.delivery_address && (
                <p className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />{selectedOrder.delivery_address}
                </p>
              )}
            </div>

            {/* Items */}
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 text-sm">
                Order Items ({selectedOrder.items?.length || 0})
              </h4>
              <div className="space-y-2">
                {(selectedOrder.items || []).map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{item.name || item.product_name}</p>
                      {(item.flavor || item.size) && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">{[item.flavor, item.size].filter(Boolean).join(' · ')}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(item.unit_price * item.quantity)}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{item.quantity} × {formatCurrency(item.unit_price)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Order total */}
            <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-xl space-y-1">
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                <span>Subtotal</span><span>{formatCurrency(selectedOrder.subtotal)}</span>
              </div>
              {selectedOrder.delivery_fee > 0 && (
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>Delivery Fee</span><span>{formatCurrency(selectedOrder.delivery_fee)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-gray-900 dark:text-gray-100 border-t border-orange-200 dark:border-orange-800 pt-1 mt-1">
                <span>Total</span><span className="text-orange-600 dark:text-orange-400">{formatCurrency(selectedOrder.total)}</span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                Payment: {(selectedOrder.payment_method || '').replace('_', ' ')} · {selectedOrder.payment_status || 'pending'}
              </div>
            </div>

            {selectedOrder.notes && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-sm text-blue-700 dark:text-blue-400">
                <strong>Notes:</strong> {selectedOrder.notes}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Cancel Modal */}
      <Modal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="Cancel Order"
        size="sm"
        footer={
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowCancelModal(false)} className="btn-secondary">Back</button>
            <button onClick={handleCancel} disabled={updatingStatus} className="btn-danger">
              {updatingStatus ? 'Cancelling...' : 'Confirm Cancel'}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            Please provide a reason for cancelling order #{selectedOrder?.order_number || selectedOrder?.id}.
          </p>
          <div>
            <label className="label">Cancellation Reason *</label>
            <textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              className="input resize-none h-24"
              placeholder="e.g. Customer request, out of stock, etc."
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default OnlineOrdersPage;
