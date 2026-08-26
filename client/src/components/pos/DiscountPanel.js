import React from 'react';
import { Tag } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { formatCurrency } from '../../utils/formatters';

function DiscountPanel() {
  const { discount, setDiscount, subtotal, discountAmount } = useCart();

  const handleTypeToggle = (type) => {
    setDiscount(type, discount.value);
  };

  const handleValueChange = (e) => {
    const val = parseFloat(e.target.value) || 0;
    setDiscount(discount.type, val);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Tag className="h-4 w-4 text-gray-400" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Discount</span>
      </div>

      <div className="flex gap-2">
        {/* Type toggle */}
        <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5 flex-shrink-0">
          <button
            onClick={() => handleTypeToggle('percentage')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              discount.type === 'percentage'
                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            %
          </button>
          <button
            onClick={() => handleTypeToggle('fixed')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              discount.type === 'fixed'
                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            M
          </button>
        </div>

        {/* Value input */}
        <div className="relative flex-1">
          <input
            type="number"
            min="0"
            max={discount.type === 'percentage' ? 100 : subtotal}
            step="0.01"
            value={discount.value || ''}
            onChange={handleValueChange}
            placeholder={discount.type === 'percentage' ? '0%' : '0.00'}
            className="input text-sm py-1.5"
          />
        </div>
      </div>

      {/* Preview */}
      {discountAmount > 0 && (
        <div className="text-xs text-green-600 dark:text-green-400 font-medium">
          Discount: -{formatCurrency(discountAmount)}
        </div>
      )}
    </div>
  );
}

export default DiscountPanel;
