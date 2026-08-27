import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './context/AuthContext';
import { useTheme } from './context/ThemeContext';

import Layout from './components/common/Layout';
import LoadingSpinner from './components/common/LoadingSpinner';

import LoginPage from './pages/LoginPage';
import POSPage from './pages/POSPage';
import ProductsPage from './pages/ProductsPage';
import InventoryPage from './pages/InventoryPage';
import CustomersPage from './pages/CustomersPage';
import ReportsPage from './pages/ReportsPage';
import OnlineOrdersPage from './pages/OnlineOrdersPage';
import PurchaseOrdersPage from './pages/PurchaseOrdersPage';
import UsersPage from './pages/UsersPage';
import PublicStorePage from './pages/PublicStorePage';

// Protected Route wrapper
function ProtectedRoute({ children, adminOnly = false }) {
  const { isAuthenticated, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/pos" replace />;
  }

  return children;
}

function App() {
  const { darkMode } = useTheme();

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: darkMode ? '#1f2937' : '#ffffff',
              color: darkMode ? '#f9fafb' : '#111827',
              border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`,
              borderRadius: '0.75rem',
              boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)'
            },
            success: {
              iconTheme: { primary: '#16a34a', secondary: '#ffffff' }
            },
            error: {
              iconTheme: { primary: '#dc2626', secondary: '#ffffff' }
            }
          }}
        />
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/online" element={<PublicStorePage />} />

          {/* Redirect root to POS */}
          <Route path="/" element={<Navigate to="/pos" replace />} />

          {/* Protected routes with layout */}
          <Route
            path="/pos"
            element={
              <ProtectedRoute>
                <Layout>
                  <POSPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/products"
            element={
              <ProtectedRoute adminOnly>
                <Layout>
                  <ProductsPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventory"
            element={
              <ProtectedRoute>
                <Layout>
                  <InventoryPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/customers"
            element={
              <ProtectedRoute>
                <Layout>
                  <CustomersPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute adminOnly>
                <Layout>
                  <ReportsPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/online-orders"
            element={
              <ProtectedRoute adminOnly>
                <Layout>
                  <OnlineOrdersPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/purchase-orders"
            element={
              <ProtectedRoute adminOnly>
                <Layout>
                  <PurchaseOrdersPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute adminOnly>
                <Layout>
                  <UsersPage />
                </Layout>
              </ProtectedRoute>
            }
          />

          {/* 404 fallback */}
          <Route path="*" element={<Navigate to="/pos" replace />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;
