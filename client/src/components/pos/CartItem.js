import React, { useState, useEffect } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import { useCart } from '../../context/CartContext';

function CartItem({ item }) {
  const { updateQuantity, removeItem } = useCart();

  const lineTotal = item.unit_price * item.quantity;
  const isMaxStock = item.stock_quantity !== undefined && item.quantity >= item.stock_quantity;

  // Local text buffer so the field can be typed into freely (including a
  // momentarily empty value) without every keystroke fighting the clamped
  // quantity coming back from the cart.
  const [qtyText, setQtyText] = useState(String(item.quantity));
  useEffect(() => { setQtyText(String(item.quantity)); }, [item.quantity]);

  const commitQty = () => {
    let next = parseInt(qtyText, 10);
    if (!Number.isFinite(next) || next < 1) next = 1;
    if (item.stock_quantity !== undefined) next = Math.min(next, item.stock_quantity);
    updateQuantity(item.variant_id, next);
    setQtyText(String(next));
  };

  return (
    <div className="flex items-start gap-2 py-2.5 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
      {/* Product info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-tight truncate">
          {item.name}
        </p>
        {(item.flavor || item.size) && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {[item.flavor, item.size].filter(Boolean).join(' · ')}
          </p>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
          {formatCurrency(item.unit_price)} each
        </p>
      </div>

      {/* Quantity controls */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={() => updateQuantity(item.variant_id, item.quantity - 1)}
          className="w-6 h-6 rounded-md bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 flex items-center justify-center transition-colors"
          aria-label="Decrease quantity"
        >
          <Minus className="h-3 w-3" />
        </button>
        <input
          type="text"
          inputMode="numeric"
          value={qtyText}
          onChange={e => setQtyText(e.target.value.replace(/[^0-9]/g, ''))}
          onFocus={e => e.target.select()}
          onBlur={commitQty}
          onKeyDown={e => {
            if (e.key === 'Enter') { commitQty(); e.currentTarget.blur(); }
          }}
          aria-label="Quantity"
          className="w-9 text-center text-sm font-semibold text-gray-900 dark:text-gray-100 bg-transparent border border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-orange-400 dark:focus:border-orange-500 rounded-md outline-none py-0.5"
        />
        <button
          onClick={() => updateQuantity(item.variant_id, item.quantity + 1)}
          disabled={isMaxStock}
          className="w-6 h-6 rounded-md bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Increase quantity"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {/* Line total + remove */}
      <div className="flex flex-col items-end gap-1 flex-shrink-0 min-w-[5rem]">
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {formatCurrency(lineTotal)}
        </span>
        <button
          onClick={() => removeItem(item.variant_id)}
          className="text-red-400 hover:text-red-600 transition-colors p-0.5 rounded"
          aria-label="Remove item"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default CartItem;
