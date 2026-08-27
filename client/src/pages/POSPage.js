import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, ShoppingCart, Package, PauseCircle, PlayCircle, Trash2, RefreshCw, Star, Gift } from 'lucide-react';
import toast from 'react-hot-toast';
import { productService, salesService } from '../services/api';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { formatCurrency } from '../utils/formatters';
import useDebounce from '../hooks/useDebounce';
import ProductCard from '../components/pos/ProductCard';
import CartItem from '../components/pos/CartItem';
import PaymentPanel from '../components/pos/PaymentPanel';
import ReceiptModal from '../components/pos/ReceiptModal';
import CustomerSearch from '../components/pos/CustomerSearch';
import DiscountPanel from '../components/pos/DiscountPanel';
import Modal from '../components/common/Modal';
import Badge from '../components/common/Badge';
import LoadingSpinner from '../components/common/LoadingSpinner';

function POSPage() {
  const { user } = useAuth();
  const {
    items, subtotal, discountAmount, tax, total, itemCount,
    addItem, clearCart, holdCart, retrieveCart, removeHeldOrder,
    heldOrders, selectedCustomer, setSelectedCustomer,
    redeemPoints, setRedeemPoints, pointsToRedeem, setPointsToRedeem,
    pointsDiscount
  } = useCart();

  // Products
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Payment
  const [paymentData, setPaymentData] = useState({ method: 'cash', isValid: false });
  const [processing, setSaleProcessing] = useState(false);

  // Modals
  const [showReceipt, setShowReceipt] = useState(false);
  const [completedSale, setCompletedSale] = useState(null);
  const [showHeldOrders, setShowHeldOrders] = useState(false);

  // Barcode scanner buffer
  const barcodeBuffer = useRef('');
  const barcodeTimer = useRef(null);
  const barcodeInputRef = useRef(null);

  const debouncedSearch = useDebounce(searchQuery, 350);

  // Fetch products
  const fetchProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const params = {};
      if (debouncedSearch) params.search = debouncedSearch;
      if (selectedCategory && selectedCategory !== 'all') params.category_id = selectedCategory;
      const res = await productService.getProducts(params);
      const list = res?.data?.products || [];
      // Flatten variants for POS grid
      const variants = [];
      list.forEach(product => {
        if (product.variants && product.variants.length > 0) {
          product.variants.forEach(v => {
            variants.push({
              ...v,
              variant_id: v.id,
              product_name: product.name,
              name: product.name,
              image_url: product.image_url,
              category: product.category
            });
          });
        }
      });
      setProducts(variants);
    } catch (err) {
      toast.error('Failed to load products');
    } finally {
      setLoadingProducts(false);
    }
  }, [debouncedSearch, selectedCategory]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await productService.getCategories();
      const list = res?.data || res;
      setCategories(Array.isArray(list) ? list : []);
    } catch {}
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);
  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  // Barcode scanner handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Barcode scanners send chars rapidly followed by Enter
      if (e.key === 'Enter' && barcodeBuffer.current.length > 3) {
        const barcode = barcodeBuffer.current;
        barcodeBuffer.current = '';
        clearTimeout(barcodeTimer.current);
        handleBarcodeSearch(barcode);
        return;
      }
      if (e.key.length === 1) {
        barcodeBuffer.current += e.key;
        clearTimeout(barcodeTimer.current);
        barcodeTimer.current = setTimeout(() => { barcodeBuffer.current = ''; }, 100);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // eslint-disable-line

  const handleBarcodeSearch = async (barcode) => {
    try {
      const res = await productService.searchByBarcode(barcode);
      const variant = res?.data || res;
      if (variant) {
        addItem({
          ...variant,
          variant_id: variant.id,
          product_name: variant.product_name || variant.name
        });
        toast.success(`Added: ${variant.product_name || variant.name}`);
      } else {
        toast.error(`Barcode not found: ${barcode}`);
      }
    } catch {
      toast.error(`Barcode not found: ${barcode}`);
    }
  };

  const handleHoldCart = () => {
    if (items.length === 0) {
      toast.error('Cart is empty');
      return;
    }
    holdCart();
    toast.success('Order held');
  };

  const handleRetrieveOrder = (id) => {
    if (items.length > 0) {
      const confirmed = window.confirm('This will replace current cart. Continue?');
      if (!confirmed) return;
    }
    retrieveCart(id);
    setShowHeldOrders(false);
    toast.success('Order retrieved');
  };

  const handleProcessSale = async () => {
    if (items.length === 0) {
      toast.error('Cart is empty');
      return;
    }
    if (!paymentData.isValid) {
      if (paymentData.method === 'cash') {
        toast.error('Amount received must be at least the total');
      } else {
        toast.error('Please enter a payment reference');
      }
      return;
    }

    setSaleProcessing(true);
    try {
      // Build the payment lines the API actually expects (an array of
      // { method, amount, reference }, summing to the sale total — not the
      // single payment_method/amount_received fields PaymentPanel tracks
      // locally for its own UI, e.g. change calculation).
      let payments;
      if (paymentData.method === 'split') {
        const cardAmount = paymentData.cardAmount || 0;
        // Any overpayment is refunded as change from the cash side, so the
        // cash amount actually applied to the sale is whatever's left after
        // the card portion — not the raw amount the cashier typed in.
        const cashAmount = Math.max(0, total - cardAmount);
        payments = [
          ...(cashAmount > 0 ? [{ method: 'cash', amount: cashAmount }] : []),
          ...(cardAmount > 0 ? [{ method: 'card', amount: cardAmount, reference: paymentData.reference || null }] : [])
        ];
      } else {
        payments = [{
          method: paymentData.method,
          amount: total,
          reference: paymentData.method === 'cash' ? null : (paymentData.reference || null)
        }];
      }

      const salePayload = {
        items: items.map(i => ({
          variant_id: i.variant_id,
          quantity: i.quantity,
          unit_price: i.unit_price
        })),
        payments,
        discount_type: 'fixed',
        discount_value: discountAmount,
        tax_rate: 15,
        customer_id: selectedCustomer?.id || null,
        points_redeemed: redeemPoints ? pointsToRedeem : 0
      };

      const res = await salesService.createSale(salePayload);
      const sale = res?.data || res;

      setCompletedSale({
        ...sale,
        items,
        customer: selectedCustomer,
        cashier_name: user?.name,
        payment_method: paymentData.method,
        amount_received: paymentData.amountReceived,
        change_amount: paymentData.change || 0,
        reference: paymentData.reference,
        subtotal,
        discount_amount: discountAmount,
        points_discount: pointsDiscount,
        tax_amount: tax,
        total_amount: total,
        points_earned: Math.floor(total / 10)
      });
      setShowReceipt(true);
      clearCart();
      toast.success('Sale completed!', { duration: 3000 });
    } catch (err) {
      toast.error(err.message || 'Failed to process sale');
    } finally {
      setSaleProcessing(false);
    }
  };

  const loyaltyPoints = selectedCustomer?.loyalty_points || 0;
  const maxRedeemable = Math.min(loyaltyPoints, Math.floor(total / 0.01));

  return (
    <div className="h-full flex overflow-hidden">
      {/* ── Left Panel: Product Browser ── */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-200 dark:border-gray-700">
        {/* Search + category bar */}
        <div className="px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              ref={barcodeInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search products or scan barcode..."
              className="input pl-9"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            )}
          </div>

          {/* Category tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              All
            </button>
            {categories.map(cat => (
              <button
                key={cat.id || cat}
                onClick={() => setSelectedCategory(cat.id || cat)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  selectedCategory === (cat.id || cat)
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {cat.name || cat}
              </button>
            ))}
          </div>
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loadingProducts ? (
            <LoadingSpinner label="Loading products..." />
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Package className="h-16 w-16 mb-3 opacity-30" />
              <p className="text-base font-medium">No products found</p>
              <p className="text-sm mt-1">Try a different search or category</p>
              <button onClick={fetchProducts} className="mt-4 btn-secondary text-sm flex items-center gap-2">
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {products.map(variant => (
                <ProductCard
                  key={variant.variant_id || variant.id}
                  variant={variant}
                  onAdd={addItem}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right Panel: Cart ── */}
      <div className="w-[380px] xl:w-[420px] flex flex-col bg-white dark:bg-gray-800 flex-shrink-0">
        {/* Cart header */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-orange-600" />
            <span className="font-semibold text-gray-900 dark:text-gray-100">Cart</span>
            {itemCount > 0 && (
              <span className="bg-orange-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {itemCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Held orders button */}
            <button
              onClick={() => setShowHeldOrders(true)}
              className="relative p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
              title="Held orders"
            >
              <PauseCircle className="h-5 w-5" />
              {heldOrders.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-yellow-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {heldOrders.length}
                </span>
              )}
            </button>
            {items.length > 0 && (
              <button
                onClick={() => { if (window.confirm('Clear cart?')) clearCart(); }}
                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors"
                title="Clear cart"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable cart content */}
        <div className="flex-1 overflow-y-auto">
          {/* Cart items */}
          <div className="px-4 py-2">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <ShoppingCart className="h-12 w-12 mb-2 opacity-30" />
                <p className="text-sm">Cart is empty</p>
                <p className="text-xs mt-1">Click products to add them</p>
              </div>
            ) : (
              items.map(item => <CartItem key={item.variant_id} item={item} />)
            )}
          </div>

          {items.length > 0 && (
            <div className="px-4 space-y-4 pb-4">
              {/* Customer selector */}
              <div>
                <p className="label">Customer (optional)</p>
                <CustomerSearch
                  selectedCustomer={selectedCustomer}
                  onSelect={setSelectedCustomer}
                  onClear={() => { setSelectedCustomer(null); setRedeemPoints(false); }}
                />
              </div>

              {/* Discount */}
              <DiscountPanel />

              {/* Loyalty points redemption */}
              {selectedCustomer && loyaltyPoints > 0 && (
                <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800">
                  <div className="flex items-center gap-2 mb-2">
                    <Gift className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                      Loyalty Points ({loyaltyPoints} pts available)
                    </span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input
                      type="checkbox"
                      checked={redeemPoints}
                      onChange={e => {
                        setRedeemPoints(e.target.checked);
                        if (!e.target.checked) setPointsToRedeem(0);
                      }}
                      className="w-4 h-4 accent-purple-600"
                    />
                    <span className="text-sm text-purple-700 dark:text-purple-300">Redeem points</span>
                  </label>
                  {redeemPoints && (
                    <div className="space-y-1">
                      <input
                        type="number"
                        min="0"
                        step="100"
                        max={maxRedeemable}
                        value={pointsToRedeem}
                        onChange={e => {
                          const capped = Math.min(parseInt(e.target.value) || 0, maxRedeemable);
                          // Redemption is only ever applied in blocks of 100 points
                          // server-side, so round down here too or the payment
                          // total won't match what the backend computes.
                          setPointsToRedeem(Math.floor(capped / 100) * 100);
                        }}
                        className="input text-sm py-1.5"
                        placeholder="Points to redeem"
                      />
                      {pointsToRedeem > 0 && (
                        <p className="text-xs text-purple-600 dark:text-purple-400">
                          = {formatCurrency(pointsToRedeem * 0.01)} discount
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Order summary */}
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 space-y-1.5">
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>Subtotal ({itemCount} items)</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                    <span>Discount</span>
                    <span>-{formatCurrency(discountAmount)}</span>
                  </div>
                )}
                {pointsDiscount > 0 && (
                  <div className="flex justify-between text-sm text-purple-600 dark:text-purple-400">
                    <span>Points Redemption</span>
                    <span>-{formatCurrency(pointsDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>VAT (15%)</span>
                  <span>{formatCurrency(tax)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg text-gray-900 dark:text-gray-100 border-t border-gray-200 dark:border-gray-600 pt-1.5 mt-1">
                  <span>Total</span>
                  <span className="text-orange-600 dark:text-orange-400">{formatCurrency(total)}</span>
                </div>
              </div>

              {/* Points to earn */}
              {selectedCustomer && (
                <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-800">
                  <Star className="h-3.5 w-3.5" />
                  This sale earns {Math.floor(total / 10)} loyalty points
                </div>
              )}

              {/* Payment */}
              <div>
                <p className="label">Payment Method</p>
                <PaymentPanel total={total} onPaymentChange={setPaymentData} />
              </div>
            </div>
          )}
        </div>

        {/* Bottom action buttons */}
        {items.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
            {/* Hold cart */}
            <button
              onClick={handleHoldCart}
              className="w-full flex items-center justify-center gap-2 btn-secondary py-2"
            >
              <PauseCircle className="h-4 w-4" />
              Hold Order
            </button>

            {/* Process sale */}
            <button
              onClick={handleProcessSale}
              disabled={processing || !paymentData.isValid}
              className="w-full py-3.5 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold rounded-xl shadow-lg shadow-green-200 dark:shadow-none transition-all flex items-center justify-center gap-2 text-base"
            >
              {processing ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <ShoppingCart className="h-5 w-5" />
                  Process Sale · {formatCurrency(total)}
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ── Held Orders Modal ── */}
      <Modal
        isOpen={showHeldOrders}
        onClose={() => setShowHeldOrders(false)}
        title="Held Orders"
        size="md"
      >
        {heldOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <PauseCircle className="h-12 w-12 mb-2 opacity-30" />
            <p>No held orders</p>
          </div>
        ) : (
          <div className="space-y-3">
            {heldOrders.map(order => (
              <div
                key={order.id}
                className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-600 rounded-xl"
              >
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{order.label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {order.items.length} items · {formatCurrency(order.items.reduce((s, i) => s + i.unit_price * i.quantity, 0))}
                  </p>
                  {order.selectedCustomer && (
                    <p className="text-xs text-orange-600 dark:text-orange-400">{order.selectedCustomer.name}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRetrieveOrder(order.id)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    <PlayCircle className="h-3.5 w-3.5" />
                    Retrieve
                  </button>
                  <button
                    onClick={() => removeHeldOrder(order.id)}
                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* ── Receipt Modal ── */}
      <ReceiptModal
        isOpen={showReceipt}
        onClose={() => setShowReceipt(false)}
        sale={completedSale}
        onNewSale={() => setShowReceipt(false)}
      />
    </div>
  );
}

export default POSPage;
