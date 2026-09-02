import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

const CartContext = createContext(null);

// VAT removed — was 0.15 (15%). Kept as a rate rather than deleting the
// tax plumbing outright, since sales history/receipts still carry a
// tax_amount field; this just makes every new sale compute to 0.
const TAX_RATE = 0;

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);
  const [discount, setDiscountState] = useState({ type: 'percentage', value: 0 });
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [heldOrders, setHeldOrders] = useState([]);
  const [redeemPoints, setRedeemPoints] = useState(false);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);

  const addItem = useCallback((variant) => {
    setItems(prev => {
      const existing = prev.find(i => i.variant_id === variant.variant_id);
      if (existing) {
        return prev.map(i =>
          i.variant_id === variant.variant_id
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [...prev, {
        variant_id: variant.variant_id || variant.id,
        name: variant.name || variant.product_name,
        flavor: variant.flavor,
        size: variant.size,
        sku: variant.sku,
        unit_price: parseFloat(variant.unit_price || variant.price),
        quantity: 1,
        stock_quantity: variant.quantity
      }];
    });
  }, []);

  const removeItem = useCallback((variantId) => {
    setItems(prev => prev.filter(i => i.variant_id !== variantId));
  }, []);

  const updateQuantity = useCallback((variantId, qty) => {
    if (qty <= 0) {
      setItems(prev => prev.filter(i => i.variant_id !== variantId));
      return;
    }
    setItems(prev =>
      prev.map(i =>
        i.variant_id === variantId ? { ...i, quantity: qty } : i
      )
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setDiscountState({ type: 'percentage', value: 0 });
    setSelectedCustomer(null);
    setRedeemPoints(false);
    setPointsToRedeem(0);
  }, []);

  const setDiscount = useCallback((type, value) => {
    setDiscountState({ type, value: parseFloat(value) || 0 });
  }, []);

  const holdCart = useCallback(() => {
    if (items.length === 0) return false;
    const held = {
      id: Date.now(),
      items: [...items],
      discount: { ...discount },
      selectedCustomer,
      heldAt: new Date().toISOString(),
      label: `Order #${Date.now().toString().slice(-4)}`
    };
    setHeldOrders(prev => [...prev, held]);
    clearCart();
    return held;
  }, [items, discount, selectedCustomer, clearCart]);

  const retrieveCart = useCallback((heldOrderId) => {
    const order = heldOrders.find(o => o.id === heldOrderId);
    if (!order) return false;
    setItems(order.items);
    setDiscountState(order.discount);
    setSelectedCustomer(order.selectedCustomer);
    setHeldOrders(prev => prev.filter(o => o.id !== heldOrderId));
    return true;
  }, [heldOrders]);

  const removeHeldOrder = useCallback((heldOrderId) => {
    setHeldOrders(prev => prev.filter(o => o.id !== heldOrderId));
  }, []);

  // Computed values
  const computed = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);

    let discountAmount = 0;
    if (discount.type === 'percentage') {
      discountAmount = subtotal * (discount.value / 100);
    } else {
      discountAmount = Math.min(discount.value, subtotal);
    }

    // Points redemption (1 point = M 0.01)
    const maxPointsRedemption = redeemPoints ? (pointsToRedeem * 0.01) : 0;

    const afterDiscount = subtotal - discountAmount - maxPointsRedemption;
    const taxable = Math.max(0, afterDiscount);
    const tax = taxable * TAX_RATE;
    const total = taxable + tax;
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

    return {
      subtotal,
      discountAmount,
      pointsDiscount: maxPointsRedemption,
      tax,
      total: Math.max(0, total),
      itemCount
    };
  }, [items, discount, redeemPoints, pointsToRedeem]);

  return (
    <CartContext.Provider value={{
      items,
      discount,
      selectedCustomer,
      heldOrders,
      redeemPoints,
      pointsToRedeem,
      ...computed,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      setDiscount,
      setSelectedCustomer,
      holdCart,
      retrieveCart,
      removeHeldOrder,
      setRedeemPoints,
      setPointsToRedeem
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within CartProvider');
  return context;
}
