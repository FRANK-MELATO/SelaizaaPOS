import React from 'react';
import { Plus, AlertTriangle, Package } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

function ProductCard({ variant, onAdd }) {
  const isOutOfStock = variant.quantity <= 0;
  const isLowStock = variant.quantity > 0 && variant.quantity <= (variant.low_stock_threshold || 5);

  return (
    <div
      className={`
        card p-3 flex flex-col gap-2 cursor-pointer select-none
        transition-all duration-150
        ${isOutOfStock
          ? 'opacity-60 cursor-not-allowed'
          : 'hover:shadow-md hover:border-orange-300 dark:hover:border-orange-600 active:scale-95'
        }
      `}
      onClick={() => !isOutOfStock && onAdd(variant)}
      role="button"
      tabIndex={isOutOfStock ? -1 : 0}
      onKeyDown={(e) => e.key === 'Enter' && !isOutOfStock && onAdd(variant)}
      aria-disabled={isOutOfStock}
    >
      {/* Product image */}
      <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center">
        {variant.image_url ? (
          <img
            src={variant.image_url}
            alt={variant.name}
            className="w-full h-full object-cover"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <Package className="h-10 w-10 text-orange-300 dark:text-orange-700" />
        )}

        {/* Stock badges */}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-lg">
            <span className="text-white text-xs font-bold bg-red-600 px-2 py-0.5 rounded-full">
              OUT OF STOCK
            </span>
          </div>
        )}
        {isLowStock && !isOutOfStock && (
          <div className="absolute top-1 right-1">
            <span className="flex items-center gap-0.5 text-xs font-medium bg-yellow-100 dark:bg-yellow-900/60 text-yellow-700 dark:text-yellow-400 px-1.5 py-0.5 rounded-full">
              <AlertTriangle className="h-3 w-3" />
              Low
            </span>
          </div>
        )}
      </div>

      {/* Product info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 dark:text-gray-100 text-sm leading-tight truncate">
          {variant.product_name || variant.name}
        </p>
        {variant.flavor && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
            {variant.flavor}
            {variant.size && ` · ${variant.size}`}
          </p>
        )}
        {variant.sku && (
          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{variant.sku}</p>
        )}
      </div>

      {/* Price + Add */}
      <div className="flex items-center justify-between mt-1">
        <span className="font-bold text-orange-600 dark:text-orange-400 text-sm">
          {formatCurrency(variant.unit_price || variant.price)}
        </span>
        {!isOutOfStock && (
          <button
            className="w-7 h-7 bg-orange-600 hover:bg-orange-700 text-white rounded-lg flex items-center justify-center transition-colors flex-shrink-0"
            onClick={(e) => { e.stopPropagation(); onAdd(variant); }}
            aria-label={`Add ${variant.product_name || variant.name} to cart`}
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Stock count */}
      <div className="text-xs text-gray-400 dark:text-gray-500">
        Stock: {variant.quantity ?? '-'}
      </div>
    </div>
  );
}

export default ProductCard;
