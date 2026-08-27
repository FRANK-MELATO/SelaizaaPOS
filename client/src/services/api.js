import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
});

// Request interceptor: attach auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('atchaar-token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401 and extract data
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('atchaar-token');
      localStorage.removeItem('atchaar-user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    const message = error.response?.data?.message || error.message || 'An error occurred';
    return Promise.reject(new Error(message));
  }
);

// ─── Auth Service ──────────────────────────────────────────────────────────
export const authService = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  changePassword: (currentPassword, newPassword) =>
    api.post('/auth/change-password', { currentPassword, newPassword })
};

// ─── Product Service ───────────────────────────────────────────────────────
export const productService = {
  getProducts: (params) => api.get('/products', { params }),
  getProduct: (id) => api.get(`/products/${id}`),
  createProduct: (data) => api.post('/products', data),
  updateProduct: (id, data) => api.put(`/products/${id}`, data),
  deleteProduct: (id) => api.delete(`/products/${id}`),
  addVariant: (productId, data) => api.post(`/products/${productId}/variants`, data),
  updateVariant: (productId, variantId, data) =>
    api.put(`/products/variants/${variantId}`, data),
  deleteVariant: (productId, variantId) =>
    api.delete(`/products/${productId}/variants/${variantId}`),
  searchByBarcode: (barcode) => api.get('/products/barcode', { params: { barcode } }),
  getCategories: () => api.get('/products/categories'),
  createCategory: (data) => api.post('/products/categories', data),
  uploadImage: (productId, formData) =>
    api.post(`/products/${productId}/image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
};

// ─── Sales Service ─────────────────────────────────────────────────────────
export const salesService = {
  createSale: (data) => api.post('/sales', data),
  getSales: (params) => api.get('/sales', { params }),
  getSale: (id) => api.get(`/sales/${id}`),
  voidSale: (id, reason) => api.post(`/sales/${id}/void`, { reason }),
  getDailySummary: (date) => api.get('/sales/summary/daily', { params: { date } }),
  holdOrder: (data) => api.post('/sales/hold', data),
  getHeldOrders: () => api.get('/sales/held'),
  retrieveHeldOrder: (id) => api.post(`/sales/held/${id}/retrieve`)
};

// ─── Inventory Service ─────────────────────────────────────────────────────
export const inventoryService = {
  getInventory: (params) => api.get('/inventory', { params }),
  adjustStock: (variantId, data) => api.post(`/inventory/${variantId}/adjust`, data),
  writeOff: (variantId, data) => api.post(`/inventory/${variantId}/write-off`, data),
  getHistory: (variantId, params) => api.get(`/inventory/${variantId}/history`, { params }),
  getLowStockAlerts: () => api.get('/inventory/alerts/low-stock'),
  getValuation: () => api.get('/inventory/valuation')
};

// ─── Customer Service ──────────────────────────────────────────────────────
export const customerService = {
  getCustomers: (params) => api.get('/customers', { params }),
  getCustomer: (id) => api.get(`/customers/${id}`),
  createCustomer: (data) => api.post('/customers', data),
  updateCustomer: (id, data) => api.put(`/customers/${id}`, data),
  deleteCustomer: (id) => api.delete(`/customers/${id}`),
  getLoyaltyInfo: (id) => api.get(`/customers/${id}/loyalty`),
  adjustPoints: (id, data) => api.put(`/customers/${id}/loyalty/adjust`, data),
  getPurchaseHistory: (id, params) => api.get(`/customers/${id}/sales`, { params })
};

// ─── Supplier Service ──────────────────────────────────────────────────────
export const supplierService = {
  getSuppliers: (params) => api.get('/suppliers', { params }),
  createSupplier: (data) => api.post('/suppliers', data),
  updateSupplier: (id, data) => api.put(`/suppliers/${id}`, data),
  getPurchaseOrders: (params) => api.get('/purchase-orders', { params }),
  createPurchaseOrder: (data) => api.post('/purchase-orders', data),
  getPurchaseOrder: (id) => api.get(`/purchase-orders/${id}`),
  receivePurchaseOrder: (id, data) => api.post(`/purchase-orders/${id}/receive`, data)
};

// ─── Online Order Service ──────────────────────────────────────────────────
export const onlineOrderService = {
  getPublicProducts: (params) => api.get('/online/products', { params }),
  placeOrder: (data) => api.post('/online/orders', data),
  trackOrder: (orderNumber, phone) => api.get('/online/orders/track', { params: { order_number: orderNumber, phone } }),
  getOrders: (params) => api.get('/online/orders', { params }),
  getOrder: (id) => api.get(`/online/orders/${id}`),
  updateStatus: (id, status, note) => api.put(`/online/orders/${id}/status`, { status, note }),
  cancelOrder: (id, reason) => api.post(`/online/orders/${id}/cancel`, { reason })
};

// ─── Report Service ────────────────────────────────────────────────────────
export const reportService = {
  getSalesSummary: (params) => api.get('/reports/sales-summary', { params }),
  getRevenueChart: (params) => api.get('/reports/revenue-chart', { params }),
  getBestSelling: (params) => api.get('/reports/best-selling', { params }),
  getPaymentMethods: (params) => api.get('/reports/payment-methods', { params }),
  getLoyaltyReport: (params) => api.get('/reports/loyalty', { params }),
  getInventoryReport: (params) => api.get('/reports/inventory', { params }),
  getPurchaseSpend: (params) => api.get('/reports/purchase-spend', { params }),
  exportCSV: (type, params) => api.get(`/reports/export/${type}`, { params, responseType: 'blob' }),
  exportPDF: (type, params) => api.get(`/reports/export/${type}/pdf`, { params, responseType: 'blob' })
};

// ─── User Service ──────────────────────────────────────────────────────────
export const userService = {
  getUsers: (params) => api.get('/users', { params }),
  createUser: (data) => api.post('/users', data),
  updateUser: (id, data) => api.put(`/users/${id}`, data),
  toggleActive: (id) => api.patch(`/users/${id}/toggle-active`),
  resetPassword: (id, newPassword) => api.post(`/users/${id}/reset-password`, { newPassword })
};

export default api;
