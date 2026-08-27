import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  ShoppingCart, Package, Archive, Users, BarChart2,
  ShoppingBag, UserCog, Moon, Sun, Menu, X, Bell,
  LogOut, ChevronDown, Wifi, WifiOff, Store, Truck
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import useOnlineStatus from '../../hooks/useOnlineStatus';
import { inventoryService, onlineOrderService } from '../../services/api';

const navItems = [
  { to: '/pos', icon: ShoppingCart, label: 'Point of Sale', roles: ['admin', 'cashier'] },
  { to: '/products', icon: Package, label: 'Products', roles: ['admin'] },
  { to: '/inventory', icon: Archive, label: 'Inventory', roles: ['admin', 'cashier'] },
  { to: '/customers', icon: Users, label: 'Customers', roles: ['admin', 'cashier'] },
  { to: '/purchase-orders', icon: Truck, label: 'Purchase Orders', roles: ['admin'] },
  { to: '/reports', icon: BarChart2, label: 'Reports', roles: ['admin'] },
  { to: '/online-orders', icon: ShoppingBag, label: 'Online Orders', roles: ['admin'] },
  { to: '/users', icon: UserCog, label: 'Staff', roles: ['admin'] }
];

function Layout({ children }) {
  const { user, logout, isAdmin } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();
  const { isOnline } = useOnlineStatus();
  const location = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [pendingOrderCount, setPendingOrderCount] = useState(0);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Fetch notification counts
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const alerts = await inventoryService.getLowStockAlerts();
        setLowStockCount(Array.isArray(alerts?.data || alerts) ? (alerts?.data || alerts).length : 0);
      } catch {}
      if (isAdmin) {
        try {
          const res = await onlineOrderService.getOrders({ status: 'pending' });
          // getOrders responds with { data: { orders: [...], pagination } },
          // not a bare array — read .data.orders (falling back to a couple
          // of looser shapes) so the count doesn't silently stay at 0.
          const list = res?.data?.orders ?? res?.orders ?? res?.data ?? res;
          setPendingOrderCount(Array.isArray(list) ? list.length : 0);
        } catch {}
      }
    };
    fetchCounts();
    const interval = setInterval(fetchCounts, 60000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  const visibleNav = navItems.filter(item =>
    item.roles.includes(user?.role || 'cashier')
  );

  const NavItem = ({ to, icon: Icon, label, badge }) => (
    <NavLink
      to={to}
      className={({ isActive }) => `
        flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm
        transition-all duration-150 group relative
        ${isActive
          ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/30'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
        }
      `}
    >
      <Icon className="h-5 w-5 flex-shrink-0" />
      <span>{label}</span>
      {badge > 0 && (
        <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full min-w-[1.25rem] h-5 flex items-center justify-center px-1">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-40
          w-64 flex flex-col flex-shrink-0
          bg-white dark:bg-gray-800
          border-r border-gray-200 dark:border-gray-700
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Sidebar header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="w-9 h-9 rounded-xl bg-orange-600 flex items-center justify-center flex-shrink-0">
            <Store className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-gray-900 dark:text-gray-100 leading-tight">SELAIzaa Products</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Premium Achaar & More</p>
          </div>
          <button
            className="ml-auto lg:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {visibleNav.map(item => (
            <NavItem
              key={item.to}
              to={item.to}
              icon={item.icon}
              label={item.label}
              badge={
                item.to === '/inventory' ? lowStockCount :
                item.to === '/online-orders' ? pendingOrderCount :
                0
              }
            />
          ))}
        </nav>

        {/* Offline indicator */}
        {!isOnline && (
          <div className="mx-3 mb-2 px-3 py-2 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 flex items-center gap-2">
            <WifiOff className="h-4 w-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
            <span className="text-xs text-yellow-700 dark:text-yellow-400 font-medium">Offline Mode</span>
          </div>
        )}

        {/* User info */}
        <div className="px-3 py-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center flex-shrink-0">
              <span className="text-orange-700 dark:text-orange-400 font-semibold text-sm">
                {user?.name?.[0]?.toUpperCase() || 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{user?.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{user?.role}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top header */}
        <header className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center px-4 gap-4 flex-shrink-0">
          {/* Hamburger */}
          <button
            className="lg:hidden p-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Page title / breadcrumb */}
          <div className="hidden lg:block">
            <h2 className="font-semibold text-gray-800 dark:text-gray-200">
              {visibleNav.find(n => n.to === location.pathname)?.label || 'SELAIzaa Products'}
            </h2>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Online status */}
            <div className={`hidden sm:flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
              isOnline
                ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400'
            }`}>
              {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {isOnline ? 'Online' : 'Offline'}
            </div>

            {/* Notifications */}
            <div className="relative">
              <button className="p-2 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors relative">
                <Bell className="h-5 w-5" />
                {(lowStockCount + pendingOrderCount) > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {lowStockCount + pendingOrderCount > 9 ? '9+' : lowStockCount + pendingOrderCount}
                  </span>
                )}
              </button>
            </div>

            {/* Dark mode toggle */}
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Toggle dark mode"
            >
              {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(prev => !prev)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
                  <span className="text-orange-700 dark:text-orange-400 font-semibold text-xs">
                    {user?.name?.[0]?.toUpperCase() || 'U'}
                  </span>
                </div>
                <span className="hidden sm:block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {user?.name}
                </span>
                <ChevronDown className="h-4 w-4 text-gray-400" />
              </button>

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-20 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{user?.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{user?.email}</p>
                      <p className="text-xs text-orange-600 dark:text-orange-400 capitalize mt-0.5">{user?.role}</p>
                    </div>
                    <button
                      onClick={logout}
                      className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

export default Layout;
