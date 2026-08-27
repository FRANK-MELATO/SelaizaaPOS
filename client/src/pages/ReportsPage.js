import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart2, TrendingUp, ShoppingBag, Users, DollarSign,
  Download, Calendar, RefreshCw, Package, Star, CreditCard,
  Wallet, ArrowDownCircle, ArrowUpCircle, Scale
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import toast from 'react-hot-toast';
import { reportService } from '../services/api';
import { formatCurrency } from '../utils/formatters';
import StatCard from '../components/common/StatCard';
import LoadingSpinner from '../components/common/LoadingSpinner';
import Badge from '../components/common/Badge';

const DATE_RANGES = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'custom', label: 'Custom' }
];

const CHART_COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#14b8a6', '#ec4899'];

const PAYMENT_COLORS = {
  cash: '#16a34a',
  card: '#2563eb',
  mobile_money: '#7c3aed',
  split: '#0891b2'
};

function CustomTooltip({ active, payload, label, currency = true }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-3">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{label}</p>
        {payload.map((entry, i) => (
          <p key={i} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: {currency ? formatCurrency(entry.value) : entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
}

function ReportsPage() {
  const [dateRange, setDateRange] = useState('today');
  const [customDates, setCustomDates] = useState({ start: '', end: '' });
  const [loading, setLoading] = useState(true);

  const [summary, setSummary] = useState(null);
  const [revenueChart, setRevenueChart] = useState([]);
  const [bestSelling, setBestSelling] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loyaltyData, setLoyaltyData] = useState(null);
  const [inventoryReport, setInventoryReport] = useState(null);
  const [purchaseSpend, setPurchaseSpend] = useState(null);

  // The report endpoints key off `period` (+ snake_case `start_date`/
  // `end_date` for a custom range) and default to `period=today`/`month`
  // whenever it's missing — they don't read camelCase `startDate`/`endDate`
  // at all, so the date-range picker up top used to have no effect on what
  // came back (every view silently showed "today", regardless of which
  // filter was selected). `getRevenueChart` separately takes a `days`
  // count, so translate the picker into that too.
  const DAYS_BY_RANGE = { today: 1, week: 7, month: 30 };

  const getDateParams = useCallback(() => {
    if (dateRange === 'custom') {
      const days = customDates.start && customDates.end
        ? Math.max(1, Math.round((new Date(customDates.end) - new Date(customDates.start)) / 86400000) + 1)
        : 30;
      return { period: 'custom', start_date: customDates.start, end_date: customDates.end, days };
    }
    return { period: dateRange, days: DAYS_BY_RANGE[dateRange] || 30 };
  }, [dateRange, customDates]);

  const fetchAllReports = useCallback(async () => {
    const params = getDateParams();
    if (params.period === 'custom' && (!params.start_date || !params.end_date)) return;
    setLoading(true);
    try {
      const [sumRes, revRes, bestRes, payRes, loyRes, invRes, spendRes] = await Promise.allSettled([
        reportService.getSalesSummary(params),
        reportService.getRevenueChart(params),
        reportService.getBestSelling(params),
        reportService.getPaymentMethods(params),
        reportService.getLoyaltyReport(params),
        reportService.getInventoryReport(params),
        reportService.getPurchaseSpend(params)
      ]);

      // Each endpoint nests its payload differently ({ data: { summary } },
      // { data: { chart } }, { data: { products } }, { data: { breakdown } }
      // ...) — unwrap each to the actual array/object the UI renders instead
      // of the envelope, or everything below quietly renders as empty.
      if (sumRes.status === 'fulfilled') {
        const payload = sumRes.value?.data || sumRes.value;
        setSummary(payload?.summary || payload || null);
      }
      if (revRes.status === 'fulfilled') {
        const payload = revRes.value?.data || revRes.value;
        const chart = payload?.chart || payload;
        setRevenueChart(Array.isArray(chart) ? chart : []);
      }
      if (bestRes.status === 'fulfilled') {
        const payload = bestRes.value?.data || bestRes.value;
        const products = payload?.products || payload;
        setBestSelling(Array.isArray(products) ? products.slice(0, 10) : []);
      }
      if (payRes.status === 'fulfilled') {
        const payload = payRes.value?.data || payRes.value;
        const breakdown = payload?.breakdown || payload;
        setPaymentMethods(Array.isArray(breakdown) ? breakdown : []);
      }
      if (loyRes.status === 'fulfilled') {
        const payload = loyRes.value?.data || loyRes.value;
        const earn = payload?.period_transactions?.find(t => t.transaction_type === 'earn');
        const redeem = payload?.period_transactions?.find(t => t.transaction_type === 'redeem');
        const tierCount = (name) => parseInt(payload?.by_tier?.find(t => t.loyalty_tier === name)?.customer_count) || 0;
        setLoyaltyData({
          points_issued: parseInt(earn?.total_points) || 0,
          points_redeemed: parseInt(redeem?.total_points) || 0,
          total_customers: parseInt(payload?.overview?.total_customers) || 0,
          tiers: { gold: tierCount('Gold'), silver: tierCount('Silver'), bronze: tierCount('Bronze') }
        });
      }
      if (invRes.status === 'fulfilled') {
        const payload = invRes.value?.data || invRes.value;
        setInventoryReport({
          total_value: parseFloat(payload?.summary?.total_retail_value) || 0,
          // rows come back as { product_name, quantity, ... } — normalize
          // to the { name, stock_quantity } shape this page renders
          low_stock_items: (payload?.low_stock_items || []).map(item => ({
            name: item.product_name,
            stock_quantity: item.quantity
          }))
        });
      }
      if (spendRes.status === 'fulfilled') {
        const payload = spendRes.value?.data || spendRes.value;
        setPurchaseSpend({
          total_purchase_spend: parseFloat(payload?.total_purchase_spend) || 0,
          orders_received: parseInt(payload?.orders_received) || 0
        });
      }
    } catch {
      toast.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, [getDateParams]);

  useEffect(() => {
    if (dateRange !== 'custom') fetchAllReports();
  }, [dateRange]); // eslint-disable-line

  const handleCustomFetch = () => {
    if (!customDates.start || !customDates.end) {
      toast.error('Please select both start and end dates');
      return;
    }
    fetchAllReports();
  };

  const handleExport = async (type, format = 'csv') => {
    try {
      const params = getDateParams();
      toast.loading('Preparing export...');
      const blob = format === 'csv'
        ? await reportService.exportCSV(type, params)
        : await reportService.exportPDF(type, params);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `atchaar-${type}-${dateRange}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.dismiss();
      toast.success('Export downloaded');
    } catch {
      toast.dismiss();
      toast.error('Export failed');
    }
  };

  // best-selling rows come back as { product_name, total_quantity,
  // total_revenue, ... } with SUM()/AVG() results as numeric strings —
  // normalize both the field names the chart reads and the types.
  const bestSellingData = bestSelling.map(p => ({
    name: p.product_name || p.name,
    quantity_sold: parseInt(p.total_quantity ?? p.quantity_sold) || 0,
    revenue: parseFloat(p.total_revenue ?? p.revenue) || 0
  }));

  const paymentPieData = paymentMethods.map(pm => ({
    name: (pm.payment_method || pm.method || '').replace('_', ' ').toUpperCase(),
    value: parseFloat(pm.total_amount || pm.amount || 0),
    count: pm.count || pm.transaction_count || 0,
    color: PAYMENT_COLORS[pm.payment_method || pm.method] || '#94a3b8'
  }));

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Reports & Analytics</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Business insights and performance</p>
        </div>
        <button onClick={fetchAllReports} className="sm:ml-auto btn-secondary flex items-center gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* Date range picker */}
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <Calendar className="h-5 w-5 text-gray-400" />
        <div className="flex gap-2 flex-wrap">
          {DATE_RANGES.map(r => (
            <button
              key={r.id}
              onClick={() => setDateRange(r.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                dateRange === r.id
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {dateRange === 'custom' && (
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={customDates.start}
              onChange={e => setCustomDates(p => ({ ...p, start: e.target.value }))}
              className="input py-1.5 text-sm w-36"
            />
            <span className="text-gray-400">to</span>
            <input
              type="date"
              value={customDates.end}
              onChange={e => setCustomDates(p => ({ ...p, end: e.target.value }))}
              className="input py-1.5 text-sm w-36"
            />
            <button onClick={handleCustomFetch} className="btn-primary py-1.5 text-sm">Apply</button>
          </div>
        )}
      </div>

      {loading ? (
        <LoadingSpinner label="Loading reports..." />
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={DollarSign}
              label="Total Revenue"
              value={formatCurrency(summary?.total_revenue || 0)}
              color="green"
            />
            <StatCard
              icon={ShoppingBag}
              label="Total Sales"
              value={summary?.total_transactions || 0}
              color="orange"
            />
            <StatCard
              icon={TrendingUp}
              label="Average Sale"
              value={formatCurrency(summary?.average_sale_value || 0)}
              color="blue"
            />
            <StatCard
              icon={Package}
              label="Items Sold"
              value={summary?.total_items_sold || 0}
              color="purple"
            />
          </div>

          {/* Net Cash Flow — revenue vs. what was spent restocking this period.
              Not full accrual profit (it's cash-basis: purchase spend counts
              when a PO was received, not when those goods actually sell) but
              it directly answers "am I taking in more than I'm spending on
              stock" for the selected range. */}
          {(() => {
            const revenue = parseFloat(summary?.total_revenue) || 0;
            const spend = purchaseSpend?.total_purchase_spend || 0;
            const net = revenue - spend;
            return (
              <div className="card p-5">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-4">
                  <Wallet className="h-5 w-5 text-teal-500" />
                  Net Cash Flow
                  <span className="text-xs font-normal text-gray-400 ml-1">Revenue vs. restocking spend</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
                    <ArrowDownCircle className="h-8 w-8 text-green-600 dark:text-green-400 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-green-700 dark:text-green-400">Revenue In</p>
                      <p className="text-lg font-bold text-green-700 dark:text-green-300">{formatCurrency(revenue)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl">
                    <ArrowUpCircle className="h-8 w-8 text-red-600 dark:text-red-400 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-red-700 dark:text-red-400">
                        Spent Restocking {purchaseSpend?.orders_received ? `(${purchaseSpend.orders_received} PO${purchaseSpend.orders_received === 1 ? '' : 's'})` : ''}
                      </p>
                      <p className="text-lg font-bold text-red-700 dark:text-red-300">{formatCurrency(spend)}</p>
                    </div>
                  </div>
                  <div className={`flex items-center gap-3 p-3 rounded-xl ${net >= 0 ? 'bg-teal-50 dark:bg-teal-900/20' : 'bg-orange-50 dark:bg-orange-900/20'}`}>
                    <Scale className={`h-8 w-8 flex-shrink-0 ${net >= 0 ? 'text-teal-600 dark:text-teal-400' : 'text-orange-600 dark:text-orange-400'}`} />
                    <div>
                      <p className={`text-xs ${net >= 0 ? 'text-teal-700 dark:text-teal-400' : 'text-orange-700 dark:text-orange-400'}`}>Net</p>
                      <p className={`text-lg font-bold ${net >= 0 ? 'text-teal-700 dark:text-teal-300' : 'text-orange-700 dark:text-orange-300'}`}>{formatCurrency(net)}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Revenue Line Chart */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-orange-500" />
                Revenue Over Time
              </h3>
              <div className="flex gap-2">
                <button onClick={() => handleExport('sales', 'csv')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400 rounded-lg transition-colors">
                  <Download className="h-3.5 w-3.5" /> CSV
                </button>
                <button onClick={() => handleExport('sales', 'pdf')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400 rounded-lg transition-colors">
                  <Download className="h-3.5 w-3.5" /> PDF
                </button>
              </div>
            </div>
            {revenueChart.length === 0 ? (
              <div className="h-52 flex items-center justify-center text-gray-400">No revenue data for this period</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={revenueChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `M${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#f97316" strokeWidth={2.5} dot={{ fill: '#f97316', r: 3 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="transactions" name="Transactions" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Best Selling */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <BarChart2 className="h-5 w-5 text-blue-500" />
                  Best Selling Products
                </h3>
                <button onClick={() => handleExport('products', 'csv')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                  <Download className="h-3.5 w-3.5" /> Export
                </button>
              </div>
              {bestSellingData.length === 0 ? (
                <div className="h-52 flex items-center justify-center text-gray-400">No sales data</div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={bestSellingData} layout="vertical" margin={{ left: 100 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${v}`} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      width={95}
                      tickFormatter={v => v?.length > 14 ? v.substring(0, 14) + '…' : v}
                    />
                    <Tooltip content={<CustomTooltip currency={false} />} />
                    <Bar dataKey="quantity_sold" name="Units Sold" fill="#f97316" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Payment Methods Donut */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-green-500" />
                  Payment Methods
                </h3>
                <button onClick={() => handleExport('payments', 'csv')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                  <Download className="h-3.5 w-3.5" /> Export
                </button>
              </div>
              {paymentPieData.length === 0 ? (
                <div className="h-52 flex items-center justify-center text-gray-400">No payment data</div>
              ) : (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width={180} height={180}>
                    <PieChart>
                      <Pie
                        data={paymentPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {paymentPieData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val) => formatCurrency(val)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 flex-1">
                    {paymentPieData.map((p, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: p.color }} />
                          <span className="text-xs text-gray-700 dark:text-gray-300">{p.name}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(p.value)}</p>
                          <p className="text-xs text-gray-400">{p.count} txns</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Loyalty Report */}
            <div className="card p-5">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <Star className="h-5 w-5 text-amber-500" />
                Loyalty Program
              </h3>
              {loyaltyData ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
                      <p className="text-xs text-amber-600 dark:text-amber-400">Points Issued</p>
                      <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{loyaltyData.points_issued || 0}</p>
                    </div>
                    <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
                      <p className="text-xs text-purple-600 dark:text-purple-400">Points Redeemed</p>
                      <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{loyaltyData.points_redeemed || 0}</p>
                    </div>
                  </div>
                  {loyaltyData.tiers && (
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Customers by Tier</p>
                      <div className="space-y-2">
                        {[
                          { tier: 'Gold', color: 'yellow', count: loyaltyData.tiers?.gold || 0 },
                          { tier: 'Silver', color: 'gray', count: loyaltyData.tiers?.silver || 0 },
                          { tier: 'Bronze', color: 'amber', count: loyaltyData.tiers?.bronze || 0 }
                        ].map(t => (
                          <div key={t.tier} className="flex items-center gap-3">
                            <Badge color={t.color} size="sm">{t.tier}</Badge>
                            <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${t.tier === 'Gold' ? 'bg-yellow-500' : t.tier === 'Silver' ? 'bg-gray-400' : 'bg-amber-500'}`}
                                style={{ width: `${loyaltyData.total_customers ? (t.count / loyaltyData.total_customers * 100) : 0}%` }}
                              />
                            </div>
                            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 w-8 text-right">{t.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">No loyalty data</div>
              )}
            </div>

            {/* Inventory Report */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <Package className="h-5 w-5 text-red-500" />
                  Inventory Status
                </h3>
                <button onClick={() => handleExport('inventory', 'csv')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                  <Download className="h-3.5 w-3.5" /> Export
                </button>
              </div>
              {inventoryReport ? (
                <div className="space-y-3">
                  <div className="flex justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
                    <span className="text-sm text-green-700 dark:text-green-400">Total Inventory Value</span>
                    <span className="font-bold text-green-700 dark:text-green-400">{formatCurrency(inventoryReport.total_value || 0)}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Low Stock Items:</p>
                  {inventoryReport.low_stock_items && inventoryReport.low_stock_items.length > 0 ? (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {inventoryReport.low_stock_items.map((item, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                          <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{item.name}</span>
                          <Badge color="yellow" size="sm">{item.stock_quantity} left</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-4">No low stock items</p>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">No inventory data</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default ReportsPage;
