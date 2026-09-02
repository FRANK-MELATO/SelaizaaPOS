import React, { useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Printer, X } from 'lucide-react';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

const STORE_INFO = {
  name: 'SELAIzaa Products',
  tagline: 'Premium Achaar & More',
  tel: '+266 50410310',
  address: 'Maseru, Lesotho'
};

function ReceiptContent({ sale }) {
  if (!sale) return null;
  const items = sale.items || [];

  return (
    <div className="font-mono text-xs text-gray-900 bg-white p-4 min-w-[280px] max-w-[320px]">
      {/* Header */}
      <div className="text-center mb-3 border-b border-dashed border-gray-400 pb-3">
        <div className="text-lg font-bold tracking-wide">{STORE_INFO.name}</div>
        <div className="text-xs text-gray-600">{STORE_INFO.tagline}</div>
        <div className="mt-1 text-xs text-gray-600">Tel: {STORE_INFO.tel}</div>
        <div className="text-xs text-gray-600">{STORE_INFO.address}</div>
      </div>

      {/* Sale info */}
      <div className="mb-3 space-y-0.5">
        <div className="flex justify-between">
          <span className="text-gray-600">Receipt #:</span>
          <span className="font-semibold">{sale.sale_number || sale.id}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Date:</span>
          <span>{formatDateTime(sale.created_at || sale.date)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Cashier:</span>
          <span>{sale.cashier_name || sale.user?.name || 'Staff'}</span>
        </div>
        {sale.customer && (
          <div className="flex justify-between">
            <span className="text-gray-600">Customer:</span>
            <span>{sale.customer.name}</span>
          </div>
        )}
      </div>

      {/* Items */}
      <div className="border-t border-dashed border-gray-400 pt-2 mb-2">
        <div className="flex justify-between text-xs font-semibold mb-1 text-gray-600">
          <span>ITEM</span>
          <span>TOTAL</span>
        </div>
        {items.map((item, i) => (
          <div key={i} className="mb-1.5">
            <div className="flex justify-between">
              <span className="flex-1 mr-1 truncate">{item.name || item.product_name}</span>
              <span className="text-right">{formatCurrency(item.unit_price * item.quantity)}</span>
            </div>
            <div className="text-gray-500 pl-1">
              {item.quantity} x {formatCurrency(item.unit_price)}
              {(item.flavor || item.size) && ` · ${[item.flavor, item.size].filter(Boolean).join(' ')}`}
            </div>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="border-t border-dashed border-gray-400 pt-2 space-y-0.5">
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span>{formatCurrency(sale.subtotal)}</span>
        </div>
        {sale.discount_amount > 0 && (
          <div className="flex justify-between text-green-700">
            <span>Discount:</span>
            <span>-{formatCurrency(sale.discount_amount)}</span>
          </div>
        )}
        {sale.points_discount > 0 && (
          <div className="flex justify-between text-purple-700">
            <span>Points Redeemed:</span>
            <span>-{formatCurrency(sale.points_discount)}</span>
          </div>
        )}
        {sale.tax_amount > 0 && (
          // VAT was removed going forward — this only shows when reprinting
          // an older receipt from before the change, where tax was charged.
          <div className="flex justify-between">
            <span>VAT:</span>
            <span>{formatCurrency(sale.tax_amount)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-base border-t border-gray-400 pt-1 mt-1">
          <span>TOTAL:</span>
          <span>{formatCurrency(sale.total_amount)}</span>
        </div>
      </div>

      {/* Payment */}
      <div className="border-t border-dashed border-gray-400 pt-2 mt-2 space-y-0.5">
        <div className="flex justify-between">
          <span>Payment:</span>
          <span className="uppercase">{(sale.payment_method || '').replace('_', ' ')}</span>
        </div>
        {sale.amount_received && (
          <div className="flex justify-between">
            <span>Received:</span>
            <span>{formatCurrency(sale.amount_received)}</span>
          </div>
        )}
        {sale.change_amount > 0 && (
          <div className="flex justify-between font-semibold">
            <span>Change:</span>
            <span>{formatCurrency(sale.change_amount)}</span>
          </div>
        )}
        {sale.reference && (
          <div className="flex justify-between">
            <span>Ref:</span>
            <span className="text-right truncate max-w-[150px]">{sale.reference}</span>
          </div>
        )}
      </div>

      {/* Loyalty */}
      {(sale.points_earned || sale.customer) && (
        <div className="border-t border-dashed border-gray-400 pt-2 mt-2 text-center text-gray-600">
          {sale.customer && <div>Customer: {sale.customer.name}</div>}
          {sale.points_earned > 0 && (
            <div className="text-green-700 font-medium">Points Earned: +{sale.points_earned}</div>
          )}
          {sale.points_redeemed > 0 && (
            <div className="text-purple-700">Points Redeemed: -{sale.points_redeemed}</div>
          )}
          {sale.customer?.loyalty_points !== undefined && (
            <div>Balance: {sale.customer.loyalty_points} points</div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-dashed border-gray-400 pt-3 mt-3 text-center text-gray-500 space-y-1">
        <div className="font-semibold text-gray-700">Thank you for your purchase!</div>
        <div>Please come again</div>
        <div className="text-xs mt-2 text-gray-400">Powered by SELAIzaa Products</div>
        <div className="text-xs text-gray-400">+266 50410310</div>
      </div>
    </div>
  );
}

function ReceiptModal({ isOpen, onClose, sale, onNewSale }) {
  const printRef = useRef(null);

  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    documentTitle: `Receipt-${sale?.sale_number || 'sale'}`,
    removeAfterPrint: false
  });

  if (!isOpen || !sale) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Sale Complete</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Success banner */}
        <div className="px-5 py-3 bg-green-50 dark:bg-green-900/20 border-b border-green-100 dark:border-green-800">
          <p className="text-green-700 dark:text-green-400 font-semibold text-center">
            Sale #{sale.sale_number || sale.id} processed successfully!
          </p>
          <p className="text-center text-sm text-green-600 dark:text-green-500 mt-0.5">
            Total: {formatCurrency(sale.total_amount)}
            {sale.change_amount > 0 && ` · Change: ${formatCurrency(sale.change_amount)}`}
          </p>
        </div>

        {/* Receipt preview */}
        <div className="px-5 py-4 max-h-80 overflow-y-auto flex justify-center bg-gray-100 dark:bg-gray-900">
          <div ref={printRef} className="shadow-md">
            <ReceiptContent sale={sale} />
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-4 flex gap-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handlePrint}
            className="flex-1 flex items-center justify-center gap-2 btn-secondary"
          >
            <Printer className="h-4 w-4" />
            Print Receipt
          </button>
          <button
            onClick={() => { onClose(); if (onNewSale) onNewSale(); }}
            className="flex-1 btn-primary"
          >
            New Sale
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReceiptModal;
