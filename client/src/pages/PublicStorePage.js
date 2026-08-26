import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShoppingCart, X, Plus, Minus, Package, Store, Phone, MapPin,
  CheckCircle, Search, Truck, CreditCard, Banknote,
  Smartphone, ArrowRight, Tag, User, LogOut, Clock
} from 'lucide-react';
import toast from 'react-hot-toast';
import { onlineOrderService } from '../services/api';
import { formatCurrency } from '../utils/formatters';
import LoadingSpinner from '../components/common/LoadingSpinner';

const PAYMENT_METHODS = [
  { id: 'cash_on_delivery', label: 'Cash on Delivery', icon: Banknote },
  { id: 'mobile_money', label: 'Mobile Money', icon: Smartphone },
  { id: 'card', label: 'Card Payment', icon: CreditCard }
];

const STATUS_STEPS = [
  { key: 'pending',    label: 'Order Received',  desc: 'We received your order' },
  { key: 'confirmed',  label: 'Confirmed',        desc: 'Your order is confirmed' },
  { key: 'processing', label: 'Being Prepared',   desc: 'Getting your order ready' },
  { key: 'shipped',    label: 'Out for Delivery', desc: 'On its way to you!' },
  { key: 'delivered',  label: 'Delivered',        desc: 'Enjoy your SELAIzaa!' },
];

const emptyCheckout = {
  name: '', phone: '', email: '', address: '', notes: '',
  payment_method: 'cash_on_delivery'
};

function StatusTimeline({ status }) {
  const stepIndex = STATUS_STEPS.findIndex(s => s.key === status);
  if (status === 'cancelled') {
    return (
      <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-center">
        <p className="text-red-600 dark:text-red-400 font-semibold">Order Cancelled</p>
        <p className="text-xs text-red-400 mt-1">Please contact us if you have questions</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {STATUS_STEPS.map((step, i) => {
        const done = i < stepIndex;
        const active = i === stepIndex;
        return (
          <div key={step.key} className={`flex items-center gap-3 ${i > stepIndex ? 'opacity-40' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${
              done ? 'bg-green-500 text-white' :
              active ? 'bg-orange-500 text-white ring-2 ring-orange-300' :
              'bg-gray-200 dark:bg-gray-700 text-gray-400'
            }`}>
              {done ? '✓' : i + 1}
            </div>
            <div>
              <p className={`text-sm font-semibold ${
                active ? 'text-orange-600 dark:text-orange-400' :
                done ? 'text-green-600 dark:text-green-400' :
                'text-gray-500 dark:text-gray-400'
              }`}>
                {step.label}
              </p>
              {active && <p className="text-xs text-gray-500 dark:text-gray-400">{step.desc}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PublicStorePage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [cartItems, setCartItems] = useState([]);
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState(emptyCheckout);
  const [formErrors, setFormErrors] = useState({});
  const [placing, setPlacing] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(null);
  const [liveOrder, setLiveOrder] = useState(null);
  const lastStatusRef = useRef(null);

  // Customer identification (persisted in localStorage)
  const [customerProfile, setCustomerProfile] = useState(() => {
    try { return JSON.parse(localStorage.getItem('selaizaa-customer')) || null; }
    catch { return null; }
  });
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginForm, setLoginForm] = useState({ name: '', phone: '' });
  const [loginErrors, setLoginErrors] = useState({});
  const [pendingCartAdd, setPendingCartAdd] = useState(null);

  // Track order modal
  const [showTrackModal, setShowTrackModal] = useState(false);
  const [trackForm, setTrackForm] = useState({ order_number: '', phone: '' });
  const [trackResult, setTrackResult] = useState(null);
  const [trackLoading, setTrackLoading] = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedCategory !== 'all') params.category_id = selectedCategory;
      if (searchQuery) params.search = searchQuery;
      const res = await onlineOrderService.getPublicProducts(params);
      setProducts(res?.data?.products || []);
      setCategories(res?.data?.categories || []);
    } catch {
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, searchQuery]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  // Poll live order status every 30 seconds after placement
  useEffect(() => {
    if (!orderSuccess) { setLiveOrder(null); lastStatusRef.current = null; return; }
    setLiveOrder(orderSuccess);
    lastStatusRef.current = orderSuccess.status;

    const poll = async () => {
      try {
        const res = await onlineOrderService.trackOrder(orderSuccess.order_number, orderSuccess.customer_phone);
        const updated = res?.data || res;
        const prev = lastStatusRef.current;
        setLiveOrder(updated);
        if (updated.status !== prev) {
          const step = STATUS_STEPS.find(s => s.key === updated.status);
          toast.success(
            updated.status === 'cancelled'
              ? 'Your order has been cancelled. Please contact us.'
              : `Order update: ${step?.label || updated.status}`,
            { duration: 6000, icon: '📦' }
          );
          lastStatusRef.current = updated.status;
        }
      } catch {}
    };

    const interval = setInterval(poll, 30000);
    return () => clearInterval(interval);
  }, [orderSuccess]);

  // ── Cart ──────────────────────────────────────────────────────────────────

  const addToCartDirect = (product, variant) => {
    setCartItems(prev => {
      const existing = prev.find(i => i.variant_id === variant.id);
      if (existing) {
        return prev.map(i => i.variant_id === variant.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, {
        variant_id: variant.id,
        name: product.name,
        flavor: variant.flavor,
        size: variant.size,
        price: parseFloat(variant.price),
        quantity: 1
      }];
    });
    toast.success(`${product.name} added to cart`, { duration: 1500 });
  };

  const addToCart = (product, variant) => {
    if (!customerProfile) {
      setPendingCartAdd({ product, variant });
      setLoginForm({ name: '', phone: '' });
      setLoginErrors({});
      setShowLoginModal(true);
      return;
    }
    addToCartDirect(product, variant);
  };

  const handleLoginSubmit = () => {
    const errs = {};
    if (!loginForm.name.trim()) errs.name = 'Name is required';
    if (!loginForm.phone.trim()) errs.phone = 'Phone is required';
    if (Object.keys(errs).length) { setLoginErrors(errs); return; }

    const profile = { name: loginForm.name.trim(), phone: loginForm.phone.trim() };
    setCustomerProfile(profile);
    localStorage.setItem('selaizaa-customer', JSON.stringify(profile));
    setCheckoutForm(p => ({ ...p, name: profile.name, phone: profile.phone }));
    setShowLoginModal(false);

    if (pendingCartAdd) {
      addToCartDirect(pendingCartAdd.product, pendingCartAdd.variant);
      setPendingCartAdd(null);
    }
  };

  const signOut = () => {
    setCustomerProfile(null);
    localStorage.removeItem('selaizaa-customer');
    setCartItems([]);
    setCheckoutForm(emptyCheckout);
    toast('Signed out', { duration: 1500 });
  };

  const updateCartQty = (variantId, qty) => {
    if (qty <= 0) {
      setCartItems(prev => prev.filter(i => i.variant_id !== variantId));
    } else {
      setCartItems(prev => prev.map(i => i.variant_id === variantId ? { ...i, quantity: qty } : i));
    }
  };

  const cartTotal = cartItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const cartCount = cartItems.reduce((s, i) => s + i.quantity, 0);

  const openCheckout = () => {
    if (customerProfile) {
      setCheckoutForm(p => ({
        ...p,
        name: p.name || customerProfile.name,
        phone: p.phone || customerProfile.phone
      }));
    }
    setShowCart(false);
    setShowCheckout(true);
  };

  // ── Track Order ───────────────────────────────────────────────────────────

  const handleTrackOrder = async () => {
    if (!trackForm.order_number.trim() || !trackForm.phone.trim()) {
      toast.error('Please enter both order number and phone');
      return;
    }
    setTrackLoading(true);
    setTrackResult(null);
    try {
      const res = await onlineOrderService.trackOrder(trackForm.order_number.trim(), trackForm.phone.trim());
      setTrackResult(res?.data || res);
    } catch (err) {
      toast.error(err.message || 'Order not found');
    } finally {
      setTrackLoading(false);
    }
  };

  // ── Checkout ──────────────────────────────────────────────────────────────

  const validateCheckout = () => {
    const errs = {};
    if (!checkoutForm.name.trim()) errs.name = 'Name is required';
    if (!checkoutForm.phone.trim()) errs.phone = 'Phone number is required';
    if (!checkoutForm.address.trim()) errs.address = 'Delivery address is required';
    if (checkoutForm.email && !/\S+@\S+\.\S+/.test(checkoutForm.email)) errs.email = 'Invalid email';
    return errs;
  };

  const handlePlaceOrder = async () => {
    const errs = validateCheckout();
    if (Object.keys(errs).length) {
      setFormErrors(errs);
      setTimeout(() => {
        const el = document.querySelector('.input-error');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      return;
    }
    setPlacing(true);
    try {
      const payload = {
        customer_name: checkoutForm.name,
        customer_phone: checkoutForm.phone,
        customer_email: checkoutForm.email,
        delivery_address: checkoutForm.address,
        notes: checkoutForm.notes,
        payment_method: checkoutForm.payment_method,
        items: cartItems.map(i => ({
          variant_id: i.variant_id,
          quantity: i.quantity,
          unit_price: i.price
        })),
        subtotal: cartTotal,
        total_amount: cartTotal
      };
      const res = await onlineOrderService.placeOrder(payload);
      const order = res?.data || res;
      setOrderSuccess(order);
      setCartItems([]);
      setShowCheckout(false);
      setShowCart(false);
    } catch (err) {
      toast.error(err.message || 'Failed to place order');
    } finally {
      setPlacing(false);
    }
  };

  // ── Order Success Screen ──────────────────────────────────────────────────

  if (orderSuccess) {
    const displayOrder = liveOrder || orderSuccess;
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="bg-green-600 px-6 py-8 text-center text-white">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-10 w-10 text-white" />
              </div>
              <h1 className="text-2xl font-bold mb-1">Order Confirmed!</h1>
              <p className="text-green-100 text-sm">Thank you, your order has been received</p>
            </div>

            <div className="px-6 py-5 space-y-5">
              <div className="space-y-2">
                {orderSuccess.order_number && (
                  <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Order Number</span>
                    <span className="font-bold text-orange-600 dark:text-orange-400">#{orderSuccess.order_number}</span>
                  </div>
                )}
                {orderSuccess.total && (
                  <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Order Total</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(orderSuccess.total)}</span>
                  </div>
                )}
              </div>

              <div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Order Status
                  <span className="ml-auto text-xs text-gray-400 font-normal">Auto-updates every 30s</span>
                </p>
                <StatusTimeline status={displayOrder.status || 'pending'} />
              </div>

              <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4">
                <p className="text-sm font-semibold text-orange-700 dark:text-orange-400 mb-1">What happens next?</p>
                <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-1 list-decimal list-inside">
                  <li>We will call you on <strong>{orderSuccess.customer_phone}</strong> to confirm</li>
                  <li>Our team will prepare your order</li>
                  <li>Your order will be delivered to your address</li>
                </ol>
              </div>

              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Phone className="h-4 w-4 flex-shrink-0" />
                <span>Questions? Call us on <strong>+266 50410310</strong></span>
              </div>
            </div>

            <div className="px-6 pb-6">
              <button
                onClick={() => setOrderSuccess(null)}
                className="w-full py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl transition-colors"
              >
                Continue Shopping
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main Store ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Navigation */}
      <nav className="sticky top-0 z-30 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-9 h-9 bg-orange-600 rounded-xl flex items-center justify-center">
              <Store className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900 dark:text-gray-100 leading-tight">SELAIzaa Products</h1>
              <p className="text-xs text-gray-400 hidden sm:block">Premium Achaar & More</p>
            </div>
          </div>

          {/* Search */}
          <div className="flex-1 max-w-md hidden sm:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {/* Track Order */}
            <button
              onClick={() => { setShowTrackModal(true); setTrackResult(null); setTrackForm({ order_number: '', phone: '' }); }}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 hidden sm:block whitespace-nowrap"
            >
              Track Order
            </button>

            {/* Customer identity */}
            {customerProfile ? (
              <div className="hidden sm:flex items-center gap-1.5 text-sm">
                <User className="h-4 w-4 text-gray-400" />
                <span className="text-gray-700 dark:text-gray-300 font-medium">{customerProfile.name.split(' ')[0]}</span>
                <button onClick={signOut} className="text-gray-400 hover:text-red-500 transition-colors ml-1" title="Sign out">
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setLoginForm({ name: '', phone: '' }); setLoginErrors({}); setShowLoginModal(true); }}
                className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-orange-600 dark:text-orange-400 hover:text-orange-700"
              >
                <User className="h-4 w-4" /> Sign In
              </button>
            )}

            {/* Cart */}
            <button
              onClick={() => setShowCart(true)}
              className="relative flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-medium text-sm transition-colors"
            >
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">Cart</span>
              {cartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="bg-gradient-to-r from-orange-600 to-orange-700 dark:from-orange-700 dark:to-orange-800 text-white">
        <div className="max-w-7xl mx-auto px-4 py-12 text-center">
          <h2 className="text-3xl md:text-5xl font-extrabold mb-3">SELAIzaa Premium Achaar</h2>
          <p className="text-orange-100 text-lg max-w-2xl mx-auto">
            Tatso e fumanehang Lai Lai — order online and get it delivered to your door.
          </p>
          <div className="flex items-center justify-center gap-6 mt-5 text-orange-100 text-sm flex-wrap">
            <span className="flex items-center gap-1"><Truck className="h-4 w-4" /> Fast Delivery</span>
            <span className="flex items-center gap-1"><Tag className="h-4 w-4" /> Fresh Quality</span>
            <span className="flex items-center gap-1"><Phone className="h-4 w-4" /> +266 50410310</span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Category filter */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
              selectedCategory === 'all'
                ? 'bg-orange-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-orange-300'
            }`}
          >
            All Products
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                selectedCategory === cat.id
                  ? 'bg-orange-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-orange-300'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Products */}
        {loading ? (
          <LoadingSpinner label="Loading products..." />
        ) : products.length === 0 ? (
          <div className="text-center py-20">
            <Package className="h-16 w-16 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No products available right now</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {products.map(product => (
              <div key={product.id} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-shadow">
                <div className="aspect-square bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center overflow-hidden">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                  ) : (
                    <Package className="h-16 w-16 text-orange-200 dark:text-orange-800" />
                  )}
                </div>

                <div className="p-4">
                  <div className="mb-2">
                    <h3 className="font-bold text-gray-900 dark:text-gray-100 text-base leading-tight">{product.name}</h3>
                    {product.category_name && (
                      <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">{product.category_name}</span>
                    )}
                    {product.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{product.description}</p>
                    )}
                  </div>

                  <div className="space-y-2 mt-3">
                    {product.variants.map(v => (
                      <div
                        key={v.id}
                        className={`flex items-center justify-between p-2 rounded-xl border transition-colors ${
                          v.stock_quantity <= 0
                            ? 'border-gray-100 dark:border-gray-700 opacity-50'
                            : 'border-gray-100 dark:border-gray-700 hover:border-orange-200 dark:hover:border-orange-700'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                            {[v.flavor, v.size].filter(Boolean).join(' · ') || 'Standard'}
                          </p>
                          <p className="font-bold text-orange-600 dark:text-orange-400 text-sm">{formatCurrency(v.price)}</p>
                        </div>
                        {v.stock_quantity > 0 ? (
                          <button
                            onClick={() => addToCart(product, v)}
                            className="flex-shrink-0 w-8 h-8 bg-orange-600 hover:bg-orange-700 text-white rounded-lg flex items-center justify-center transition-colors"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        ) : (
                          <span className="text-xs text-red-500 font-medium flex-shrink-0">Sold Out</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 mt-16 py-10">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 bg-orange-600 rounded-lg flex items-center justify-center">
                <Store className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold text-white">SELAIzaa Products</span>
            </div>
            <p>Premium handcrafted achaar made with authentic recipes. Tatso e fumanehang Lai Lai.</p>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-2">Contact Us</h4>
            <p className="flex items-center gap-2"><Phone className="h-4 w-4" /> +266 50410310</p>
            <p className="flex items-center gap-2 mt-1"><MapPin className="h-4 w-4" /> Maseru, Lesotho</p>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-2">Delivery Info</h4>
            <p>Same-day delivery in Maseru</p>
            <p className="mt-1">Mon – Sat: 8am – 6pm</p>
          </div>
        </div>
        <div className="text-center text-xs mt-8 border-t border-gray-800 pt-6 text-gray-600">
          © {new Date().getFullYear()} SELAIzaa Products · All rights reserved
        </div>
      </footer>

      {/* ── Customer Sign In Modal ── */}
      {showLoginModal && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => { setShowLoginModal(false); setPendingCartAdd(null); }} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm">
              <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-700 text-center">
                <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
                  <User className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                </div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Who are you?</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Enter your name and phone to continue shopping
                </p>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="label">Your Name *</label>
                  <input
                    type="text"
                    value={loginForm.name}
                    onChange={e => setLoginForm(p => ({ ...p, name: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleLoginSubmit()}
                    className={`input ${loginErrors.name ? 'input-error' : ''}`}
                    placeholder="e.g. Thabo Mokoena"
                    autoFocus
                  />
                  {loginErrors.name && <p className="error-text">{loginErrors.name}</p>}
                </div>
                <div>
                  <label className="label">Phone Number *</label>
                  <input
                    type="tel"
                    value={loginForm.phone}
                    onChange={e => setLoginForm(p => ({ ...p, phone: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleLoginSubmit()}
                    className={`input ${loginErrors.phone ? 'input-error' : ''}`}
                    placeholder="+266 5xxx xxxx"
                  />
                  {loginErrors.phone && <p className="error-text">{loginErrors.phone}</p>}
                </div>
                <button
                  onClick={handleLoginSubmit}
                  className="w-full py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl transition-colors"
                >
                  Continue Shopping
                </button>
                <p className="text-xs text-center text-gray-400">
                  We use this to process your order and stay in touch
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Track Order Modal ── */}
      {showTrackModal && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setShowTrackModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Track My Order</h2>
                <button onClick={() => setShowTrackModal(false)} className="p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="label">Order Number</label>
                  <input
                    type="text"
                    value={trackForm.order_number}
                    onChange={e => setTrackForm(p => ({ ...p, order_number: e.target.value }))}
                    className="input"
                    placeholder="e.g. ONL-20260702-0001"
                  />
                </div>
                <div>
                  <label className="label">Phone Number</label>
                  <input
                    type="tel"
                    value={trackForm.phone}
                    onChange={e => setTrackForm(p => ({ ...p, phone: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleTrackOrder()}
                    className="input"
                    placeholder="+266 5xxx xxxx"
                  />
                </div>
                <button
                  onClick={handleTrackOrder}
                  disabled={trackLoading}
                  className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors"
                >
                  {trackLoading ? 'Looking up...' : 'Track Order'}
                </button>

                {trackResult && (
                  <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-4">
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">Order</span>
                        <span className="font-bold text-orange-600 dark:text-orange-400">#{trackResult.order_number}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">Total</span>
                        <span className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(trackResult.total)}</span>
                      </div>
                    </div>
                    <StatusTimeline status={trackResult.status} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Cart Sidebar ── */}
      {showCart && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setShowCart(false)} />
          <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-white dark:bg-gray-800 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-orange-600" />
                Cart ({cartCount})
              </h2>
              <button onClick={() => setShowCart(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {cartItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <ShoppingCart className="h-12 w-12 mb-3 opacity-30" />
                  <p>Your cart is empty</p>
                  <button onClick={() => setShowCart(false)} className="mt-3 text-orange-600 hover:text-orange-700 text-sm font-medium">
                    Continue Shopping
                  </button>
                </div>
              ) : (
                cartItems.map(item => (
                  <div key={item.variant_id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{item.name}</p>
                      {(item.flavor || item.size) && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">{[item.flavor, item.size].filter(Boolean).join(' · ')}</p>
                      )}
                      <p className="text-sm font-bold text-orange-600 dark:text-orange-400 mt-0.5">{formatCurrency(item.price * item.quantity)}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => updateCartQty(item.variant_id, item.quantity - 1)}
                        className="w-7 h-7 rounded-lg bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                      <button
                        onClick={() => updateCartQty(item.variant_id, item.quantity + 1)}
                        className="w-7 h-7 rounded-lg bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {cartItems.length > 0 && (
              <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                {customerProfile && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    Shopping as <strong>{customerProfile.name}</strong>
                  </p>
                )}
                <div className="flex justify-between font-bold text-lg">
                  <span className="text-gray-900 dark:text-gray-100">Total</span>
                  <span className="text-orange-600 dark:text-orange-400">{formatCurrency(cartTotal)}</span>
                </div>
                <button
                  onClick={openCheckout}
                  className="w-full py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  Checkout <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Checkout Modal ── */}
      {showCheckout && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setShowCheckout(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Place Your Order</h2>
                <button onClick={() => setShowCheckout(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-xl">
                  <p className="text-sm font-medium text-orange-700 dark:text-orange-400 mb-2">Order Summary</p>
                  {cartItems.map(item => (
                    <div key={item.variant_id} className="flex justify-between text-sm text-gray-700 dark:text-gray-300 py-0.5">
                      <span>{item.name} {[item.flavor, item.size].filter(Boolean).join(' ')} ×{item.quantity}</span>
                      <span className="font-medium">{formatCurrency(item.price * item.quantity)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-bold mt-2 pt-2 border-t border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-400">
                    <span>Total</span>
                    <span>{formatCurrency(cartTotal)}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="label">Full Name *</label>
                    <input type="text" value={checkoutForm.name} onChange={e => setCheckoutForm(p => ({ ...p, name: e.target.value }))}
                      className={`input ${formErrors.name ? 'input-error' : ''}`} placeholder="Your full name" />
                    {formErrors.name && <p className="error-text">{formErrors.name}</p>}
                  </div>
                  <div>
                    <label className="label">Phone Number *</label>
                    <input type="tel" value={checkoutForm.phone} onChange={e => setCheckoutForm(p => ({ ...p, phone: e.target.value }))}
                      className={`input ${formErrors.phone ? 'input-error' : ''}`} placeholder="+266 50410310" />
                    {formErrors.phone && <p className="error-text">{formErrors.phone}</p>}
                  </div>
                  <div>
                    <label className="label">Email (optional)</label>
                    <input type="email" value={checkoutForm.email} onChange={e => setCheckoutForm(p => ({ ...p, email: e.target.value }))}
                      className={`input ${formErrors.email ? 'input-error' : ''}`} placeholder="you@example.com" />
                    {formErrors.email && <p className="error-text">{formErrors.email}</p>}
                  </div>
                  <div>
                    <label className="label">Delivery Address *</label>
                    <textarea value={checkoutForm.address} onChange={e => setCheckoutForm(p => ({ ...p, address: e.target.value }))}
                      className={`input resize-none h-20 ${formErrors.address ? 'input-error' : ''}`} placeholder="Street, area, city..." />
                    {formErrors.address && <p className="error-text">{formErrors.address}</p>}
                  </div>

                  <div>
                    <label className="label">Payment Method</label>
                    <div className="space-y-2">
                      {PAYMENT_METHODS.map(pm => (
                        <label key={pm.id} className={`flex items-center gap-3 p-3 border-2 rounded-xl cursor-pointer transition-colors ${
                          checkoutForm.payment_method === pm.id
                            ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                            : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
                        }`}>
                          <input
                            type="radio"
                            name="payment_method"
                            value={pm.id}
                            checked={checkoutForm.payment_method === pm.id}
                            onChange={() => setCheckoutForm(p => ({ ...p, payment_method: pm.id }))}
                            className="accent-orange-600"
                          />
                          <pm.icon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{pm.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="label">Special Instructions (optional)</label>
                    <textarea value={checkoutForm.notes} onChange={e => setCheckoutForm(p => ({ ...p, notes: e.target.value }))}
                      className="input resize-none h-16" placeholder="Allergies, special requests..." />
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={handlePlaceOrder}
                  disabled={placing}
                  className="w-full py-3 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  {placing ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Placing Order...
                    </>
                  ) : (
                    <>Place Order · {formatCurrency(cartTotal)}</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default PublicStorePage;
