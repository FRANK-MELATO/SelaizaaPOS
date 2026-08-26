/**
 * Format a number as Lesotho Loti currency
 * e.g. 1234.56 => "M 1,234.56"
 */
export const formatCurrency = (amount) => {
  const num = Number(amount) || 0;
  return `R ${num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};

/**
 * Format a date string to local date
 */
export const formatDate = (date) => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  });
};

/**
 * Format a date string to local date + time
 */
export const formatDateTime = (date) => {
  if (!date) return '-';
  return new Date(date).toLocaleString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
};

/**
 * Format time only
 */
export const formatTime = (date) => {
  if (!date) return '-';
  return new Date(date).toLocaleTimeString('en-ZA', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
};

/**
 * Get Tailwind color class for loyalty tier
 */
export const getLoyaltyTierColor = (tier) => {
  const map = {
    Bronze: 'amber',
    Silver: 'gray',
    Gold: 'yellow'
  };
  return map[tier] || 'gray';
};

/**
 * Get Tailwind color class for various statuses
 */
export const getStatusColor = (status) => {
  const map = {
    // Sales
    completed: 'green',
    voided: 'red',
    held: 'yellow',
    // Online orders
    pending: 'yellow',
    confirmed: 'blue',
    processing: 'orange',
    shipped: 'purple',
    delivered: 'green',
    cancelled: 'red',
    // Inventory
    in_stock: 'green',
    low_stock: 'yellow',
    out_of_stock: 'red',
    // Users
    active: 'green',
    inactive: 'gray',
    // Payments
    cash: 'green',
    card: 'blue',
    mobile_money: 'purple',
    split: 'indigo'
  };
  return map[status?.toLowerCase()] || 'gray';
};

/**
 * Format a number with commas (no currency prefix)
 */
export const formatNumber = (num) => {
  return Number(num || 0).toLocaleString('en-ZA');
};

/**
 * Truncate a string to a max length
 */
export const truncate = (str, maxLen = 30) => {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
};

/**
 * Calculate loyalty tier based on total spend
 */
export const getLoyaltyTier = (totalSpend) => {
  const spend = Number(totalSpend) || 0;
  if (spend >= 5000) return 'Gold';
  if (spend >= 1000) return 'Silver';
  return 'Bronze';
};

/**
 * Get next tier threshold for progress bar
 */
export const getNextTierInfo = (totalSpend) => {
  const spend = Number(totalSpend) || 0;
  if (spend >= 5000) return { next: 'Gold', threshold: 5000, current: 5000, progress: 100 };
  if (spend >= 1000) return {
    next: 'Gold',
    threshold: 5000,
    current: spend,
    progress: ((spend - 1000) / (5000 - 1000)) * 100
  };
  return {
    next: 'Silver',
    threshold: 1000,
    current: spend,
    progress: (spend / 1000) * 100
  };
};

/**
 * Parse a date range label into {startDate, endDate}
 */
export const parseDateRange = (range) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  switch (range) {
    case 'today':
      return {
        startDate: today.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10)
      };
    case 'week': {
      const start = new Date(today);
      start.setDate(today.getDate() - today.getDay());
      return {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10)
      };
    }
    case 'month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10)
      };
    }
    default:
      return {
        startDate: today.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10)
      };
  }
};
