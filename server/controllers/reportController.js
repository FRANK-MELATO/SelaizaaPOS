const { query } = require('../config/db');

/**
 * Build date range condition
 */
const buildDateRange = (period, start_date, end_date) => {
  const now = new Date();
  let startStr, endStr;

  switch (period) {
    case 'today':
      startStr = now.toISOString().slice(0, 10);
      endStr = startStr;
      break;
    case 'week': {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 6);
      startStr = weekAgo.toISOString().slice(0, 10);
      endStr = now.toISOString().slice(0, 10);
      break;
    }
    case 'month': {
      const monthAgo = new Date(now);
      monthAgo.setDate(monthAgo.getDate() - 29);
      startStr = monthAgo.toISOString().slice(0, 10);
      endStr = now.toISOString().slice(0, 10);
      break;
    }
    case 'custom':
    default:
      startStr = start_date || now.toISOString().slice(0, 10);
      endStr = end_date || now.toISOString().slice(0, 10);
  }

  return { startStr, endStr };
};

/**
 * GET /api/reports/sales-summary
 * daily/weekly/monthly totals
 */
const getSalesSummary = async (req, res, next) => {
  try {
    const { period = 'today', start_date, end_date } = req.query;
    const { startStr, endStr } = buildDateRange(period, start_date, end_date);

    const [summaryResult, voidedResult, itemsSoldResult, onlineResult] = await Promise.all([
      query(
        `SELECT
           COUNT(*) AS total_transactions,
           COALESCE(SUM(total), 0) AS total_revenue,
           COALESCE(SUM(subtotal), 0) AS total_subtotal,
           COALESCE(SUM(tax_amount), 0) AS total_tax,
           COALESCE(SUM(discount_amount), 0) AS total_discounts,
           COALESCE(SUM(points_redeemed_value), 0) AS total_points_redeemed_value,
           COALESCE(AVG(total), 0) AS average_sale_value,
           COALESCE(MIN(total), 0) AS min_sale,
           COALESCE(MAX(total), 0) AS max_sale
         FROM sales
         WHERE status = 'completed'
           AND created_at >= $1::date
           AND created_at < ($2::date + INTERVAL '1 day')`,
        [startStr, endStr]
      ),
      query(
        `SELECT COUNT(*) AS voided_count FROM sales
         WHERE status = 'voided'
           AND created_at >= $1::date
           AND created_at < ($2::date + INTERVAL '1 day')`,
        [startStr, endStr]
      ),
      query(
        `SELECT COALESCE(SUM(si.quantity), 0) AS total_items_sold
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         WHERE s.status = 'completed'
           AND s.created_at >= $1::date
           AND s.created_at < ($2::date + INTERVAL '1 day')`,
        [startStr, endStr]
      ),
      query(
        `SELECT
           COUNT(*) AS online_orders_count,
           COALESCE(SUM(total), 0) AS online_revenue,
           COALESCE(SUM(oi.qty), 0) AS online_items_sold
         FROM online_orders o
         LEFT JOIN (
           SELECT order_id, SUM(quantity) AS qty FROM online_order_items GROUP BY order_id
         ) oi ON oi.order_id = o.id
         WHERE o.status != 'cancelled'
           AND o.created_at >= $1::date
           AND o.created_at < ($2::date + INTERVAL '1 day')`,
        [startStr, endStr]
      )
    ]);

    const pos = summaryResult.rows[0];
    const online = onlineResult.rows[0];

    res.json({
      success: true,
      data: {
        period,
        start_date: startStr,
        end_date: endStr,
        summary: {
          ...pos,
          total_transactions: parseInt(pos.total_transactions) + parseInt(online.online_orders_count),
          total_revenue: (parseFloat(pos.total_revenue) + parseFloat(online.online_revenue)).toFixed(2),
          total_items_sold: parseInt(itemsSoldResult.rows[0].total_items_sold) + parseInt(online.online_items_sold),
          voided_count: parseInt(voidedResult.rows[0].voided_count),
          online_orders_count: parseInt(online.online_orders_count),
          online_revenue: parseFloat(online.online_revenue).toFixed(2)
        }
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/reports/revenue-chart
 * Revenue grouped by day for the last N days
 */
const getRevenueChart = async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const numDays = Math.min(parseInt(days) || 30, 365);

    const [posResult, onlineResult] = await Promise.all([
      query(
        `SELECT
           DATE(s.created_at) AS date,
           COUNT(*) AS transactions,
           COALESCE(SUM(s.total), 0) AS revenue,
           COALESCE(SUM(s.tax_amount), 0) AS tax,
           COALESCE(SUM(s.discount_amount), 0) AS discounts
         FROM sales s
         WHERE s.status = 'completed'
           AND s.created_at >= NOW() - INTERVAL '${numDays} days'
         GROUP BY DATE(s.created_at)
         ORDER BY date ASC`
      ),
      query(
        `SELECT
           DATE(created_at) AS date,
           COUNT(*) AS transactions,
           COALESCE(SUM(total), 0) AS revenue
         FROM online_orders
         WHERE status != 'cancelled'
           AND created_at >= NOW() - INTERVAL '${numDays} days'
         GROUP BY DATE(created_at)
         ORDER BY date ASC`
      )
    ]);

    // Merge POS + online into a single dataMap keyed by date
    const dataMap = {};
    posResult.rows.forEach(row => {
      dataMap[row.date] = {
        date: row.date,
        transactions: parseInt(row.transactions),
        revenue: parseFloat(row.revenue),
        tax: parseFloat(row.tax),
        discounts: parseFloat(row.discounts),
        online_revenue: 0
      };
    });
    onlineResult.rows.forEach(row => {
      const d = row.date;
      if (dataMap[d]) {
        dataMap[d].transactions += parseInt(row.transactions);
        dataMap[d].revenue += parseFloat(row.revenue);
        dataMap[d].online_revenue = parseFloat(row.revenue);
      } else {
        dataMap[d] = {
          date: d,
          transactions: parseInt(row.transactions),
          revenue: parseFloat(row.revenue),
          tax: 0,
          discounts: 0,
          online_revenue: parseFloat(row.revenue)
        };
      }
    });

    const chartData = [];
    for (let i = numDays - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().slice(0, 10);
      chartData.push(dataMap[dateStr] || {
        date: dateStr, transactions: 0, revenue: 0, tax: 0, discounts: 0, online_revenue: 0
      });
    }

    res.json({
      success: true,
      data: { days: numDays, chart: chartData }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/reports/best-selling
 * Top 10 products by revenue/quantity in period
 */
const getBestSellingProducts = async (req, res, next) => {
  try {
    const { period = 'month', start_date, end_date, sort_by = 'revenue', limit = 10 } = req.query;
    const { startStr, endStr } = buildDateRange(period, start_date, end_date);

    const orderBy = sort_by === 'quantity' ? 'total_quantity DESC' : 'total_revenue DESC';

    const result = await query(
      `SELECT
         p.id AS product_id,
         p.name AS product_name,
         pv.size, pv.flavor,
         pv.sku,
         c.name AS category_name,
         SUM(combined.quantity) AS total_quantity,
         SUM(combined.total_price) AS total_revenue,
         AVG(combined.unit_price) AS avg_price,
         COUNT(DISTINCT combined.order_ref) AS transaction_count
       FROM (
         SELECT si.variant_id, si.quantity, si.total_price, si.unit_price, si.sale_id AS order_ref
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         WHERE s.status = 'completed'
           AND s.created_at >= $1::date
           AND s.created_at < ($2::date + INTERVAL '1 day')
         UNION ALL
         SELECT oi.variant_id, oi.quantity, oi.total_price, oi.unit_price, oi.order_id AS order_ref
         FROM online_order_items oi
         JOIN online_orders o ON o.id = oi.order_id
         WHERE o.status != 'cancelled'
           AND o.created_at >= $1::date
           AND o.created_at < ($2::date + INTERVAL '1 day')
       ) combined
       JOIN product_variants pv ON pv.id = combined.variant_id
       JOIN products p ON p.id = pv.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       GROUP BY p.id, p.name, pv.size, pv.flavor, pv.sku, c.name
       ORDER BY ${orderBy}
       LIMIT $3`,
      [startStr, endStr, parseInt(limit)]
    );

    res.json({
      success: true,
      data: {
        period,
        start_date: startStr,
        end_date: endStr,
        sort_by,
        products: result.rows
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/reports/payment-methods
 * Totals by payment method
 */
const getPaymentMethodBreakdown = async (req, res, next) => {
  try {
    const { period = 'month', start_date, end_date } = req.query;
    const { startStr, endStr } = buildDateRange(period, start_date, end_date);

    const result = await query(
      `SELECT
         method,
         COUNT(*) AS transaction_count,
         SUM(total_amount) AS total_amount,
         ROUND(SUM(total_amount) * 100.0 / NULLIF(SUM(SUM(total_amount)) OVER (), 0), 2) AS percentage
       FROM (
         SELECT p.method, p.amount AS total_amount
         FROM payments p
         JOIN sales s ON s.id = p.sale_id
         WHERE s.status = 'completed'
           AND s.created_at >= $1::date
           AND s.created_at < ($2::date + INTERVAL '1 day')
         UNION ALL
         SELECT payment_method AS method, total AS total_amount
         FROM online_orders
         WHERE status != 'cancelled'
           AND created_at >= $1::date
           AND created_at < ($2::date + INTERVAL '1 day')
       ) combined
       GROUP BY method
       ORDER BY total_amount DESC`,
      [startStr, endStr]
    );

    const totalResult = await query(
      `SELECT COALESCE(SUM(total_amount), 0) AS grand_total
       FROM (
         SELECT p.amount AS total_amount
         FROM payments p
         JOIN sales s ON s.id = p.sale_id
         WHERE s.status = 'completed'
           AND s.created_at >= $1::date
           AND s.created_at < ($2::date + INTERVAL '1 day')
         UNION ALL
         SELECT total AS total_amount
         FROM online_orders
         WHERE status != 'cancelled'
           AND created_at >= $1::date
           AND created_at < ($2::date + INTERVAL '1 day')
       ) combined`,
      [startStr, endStr]
    );

    res.json({
      success: true,
      data: {
        period,
        start_date: startStr,
        end_date: endStr,
        grand_total: totalResult.rows[0].grand_total,
        breakdown: result.rows
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/reports/loyalty
 * Customers by tier, points issued vs redeemed
 */
const getLoyaltyReport = async (req, res, next) => {
  try {
    const { period = 'month', start_date, end_date } = req.query;
    const { startStr, endStr } = buildDateRange(period, start_date, end_date);

    const tierResult = await query(
      `SELECT loyalty_tier, COUNT(*) AS customer_count,
              SUM(loyalty_points) AS total_points,
              AVG(loyalty_points) AS avg_points,
              SUM(total_spent) AS total_spent
       FROM customers
       GROUP BY loyalty_tier
       ORDER BY CASE loyalty_tier WHEN 'Gold' THEN 1 WHEN 'Silver' THEN 2 ELSE 3 END`
    );

    const transactionResult = await query(
      `SELECT
         transaction_type,
         COUNT(*) AS count,
         SUM(ABS(points_change)) AS total_points
       FROM loyalty_transactions
       WHERE created_at >= $1::date
         AND created_at < ($2::date + INTERVAL '1 day')
       GROUP BY transaction_type`,
      [startStr, endStr]
    );

    const topCustomersResult = await query(
      `SELECT c.id, c.name, c.loyalty_points, c.loyalty_tier, c.total_spent
       FROM customers c
       ORDER BY c.loyalty_points DESC
       LIMIT 10`
    );

    const totalsResult = await query(
      `SELECT
         COUNT(*) AS total_customers,
         SUM(loyalty_points) AS total_points_outstanding,
         (SUM(loyalty_points) / 100.0 * 10) AS outstanding_points_value
       FROM customers`
    );

    res.json({
      success: true,
      data: {
        period,
        start_date: startStr,
        end_date: endStr,
        overview: totalsResult.rows[0],
        by_tier: tierResult.rows,
        period_transactions: transactionResult.rows,
        top_customers: topCustomersResult.rows
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/reports/inventory
 * Stock levels, valuation, low stock count
 */
const getInventoryReport = async (req, res, next) => {
  try {
    const summaryResult = await query(
      `SELECT
         COUNT(DISTINCT p.id) AS total_products,
         COUNT(pv.id) AS total_variants,
         SUM(i.quantity) AS total_units,
         SUM(i.quantity * COALESCE(pv.cost_price, 0)) AS total_cost_value,
         SUM(i.quantity * pv.price) AS total_retail_value,
         SUM(CASE WHEN i.quantity <= i.low_stock_threshold THEN 1 ELSE 0 END) AS low_stock_count,
         SUM(CASE WHEN i.quantity = 0 THEN 1 ELSE 0 END) AS out_of_stock_count
       FROM inventory i
       JOIN product_variants pv ON pv.id = i.variant_id
       JOIN products p ON p.id = pv.product_id
       WHERE p.is_active = true AND pv.is_active = true`
    );

    const categoryBreakdownResult = await query(
      `SELECT c.name AS category, COUNT(pv.id) AS variants, SUM(i.quantity) AS total_units,
              SUM(i.quantity * pv.price) AS retail_value
       FROM inventory i
       JOIN product_variants pv ON pv.id = i.variant_id
       JOIN products p ON p.id = pv.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.is_active = true AND pv.is_active = true
       GROUP BY c.name
       ORDER BY retail_value DESC`
    );

    const lowStockResult = await query(
      `SELECT p.name AS product_name, pv.sku, pv.size, pv.flavor, i.quantity, i.low_stock_threshold
       FROM inventory i
       JOIN product_variants pv ON pv.id = i.variant_id
       JOIN products p ON p.id = pv.product_id
       WHERE i.quantity <= i.low_stock_threshold
         AND p.is_active = true AND pv.is_active = true
       ORDER BY i.quantity ASC
       LIMIT 20`
    );

    const recentMovementsResult = await query(
      `SELECT ih.change_type, ih.quantity_change, ih.quantity_after, ih.notes, ih.created_at,
              p.name AS product_name, pv.sku
       FROM inventory_history ih
       JOIN product_variants pv ON pv.id = ih.variant_id
       JOIN products p ON p.id = pv.product_id
       ORDER BY ih.created_at DESC
       LIMIT 10`
    );

    res.json({
      success: true,
      data: {
        summary: summaryResult.rows[0],
        by_category: categoryBreakdownResult.rows,
        low_stock_items: lowStockResult.rows,
        recent_movements: recentMovementsResult.rows
      }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getSalesSummary,
  getRevenueChart,
  getBestSellingProducts,
  getPaymentMethodBreakdown,
  getLoyaltyReport,
  getInventoryReport
};
