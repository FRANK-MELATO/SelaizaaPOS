import React, { useState, useEffect } from 'react';
import { CreditCard, Smartphone, Banknote, Split } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash', icon: Banknote, color: 'green' },
  { id: 'card', label: 'Card', icon: CreditCard, color: 'blue' },
  { id: 'mobile_money', label: 'Mobile Money', icon: Smartphone, color: 'purple' }
];

function PaymentPanel({ total, onPaymentChange }) {
  const [method, setMethod] = useState('cash');
  const [amountReceived, setAmountReceived] = useState('');
  const [reference, setReference] = useState('');
  const [splitMode, setSplitMode] = useState(false);
  const [splitCash, setSplitCash] = useState('');
  const [splitCard, setSplitCard] = useState('');
  const [splitRef, setSplitRef] = useState('');

  const cashFloat = parseFloat(amountReceived) || 0;
  const change = Math.max(0, cashFloat - total);
  const splitCashFloat = parseFloat(splitCash) || 0;
  const splitCardFloat = parseFloat(splitCard) || 0;
  const splitTotal = splitCashFloat + splitCardFloat;
  const splitChange = Math.max(0, splitTotal - total);

  useEffect(() => {
    if (splitMode) {
      onPaymentChange({
        method: 'split',
        cashAmount: splitCashFloat,
        cardAmount: splitCardFloat,
        reference: splitRef,
        change: splitChange,
        isValid: splitTotal >= total && (splitCardFloat === 0 || splitRef)
      });
    } else if (method === 'cash') {
      onPaymentChange({
        method: 'cash',
        amountReceived: cashFloat,
        change,
        isValid: cashFloat >= total
      });
    } else {
      onPaymentChange({
        method,
        reference,
        change: 0,
        isValid: !!reference
      });
    }
  }, [method, amountReceived, reference, splitMode, splitCash, splitCard, splitRef]); // eslint-disable-line

  const handleMethodSelect = (m) => {
    setMethod(m);
    setSplitMode(false);
    setAmountReceived('');
    setReference('');
  };

  // Quick cash buttons
  const quickAmounts = [
    Math.ceil(total / 5) * 5,
    Math.ceil(total / 10) * 10,
    Math.ceil(total / 20) * 20,
    Math.ceil(total / 50) * 50
  ].filter((v, i, arr) => arr.indexOf(v) === i && v >= total).slice(0, 4);

  return (
    <div className="space-y-3">
      {/* Method selection */}
      {!splitMode && (
        <div className="grid grid-cols-3 gap-2">
          {PAYMENT_METHODS.map(pm => (
            <button
              key={pm.id}
              onClick={() => handleMethodSelect(pm.id)}
              className={`
                flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border-2 font-medium text-xs transition-all
                ${method === pm.id
                  ? `border-${pm.color}-500 bg-${pm.color}-50 dark:bg-${pm.color}-900/20 text-${pm.color}-700 dark:text-${pm.color}-400`
                  : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500'
                }
              `}
            >
              <pm.icon className="h-4 w-4" />
              {pm.label}
            </button>
          ))}
        </div>
      )}

      {/* Split mode toggle */}
      <button
        onClick={() => { setSplitMode(prev => !prev); }}
        className={`w-full flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
          splitMode
            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400'
            : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300'
        }`}
      >
        <Split className="h-3.5 w-3.5" />
        {splitMode ? 'Cancel Split Payment' : 'Split Payment'}
      </button>

      {/* Cash payment inputs */}
      {!splitMode && method === 'cash' && (
        <div className="space-y-2">
          <div>
            <label className="label text-xs">Amount Received</label>
            <input
              type="number"
              min={total}
              step="0.01"
              value={amountReceived}
              onChange={e => setAmountReceived(e.target.value)}
              placeholder={formatCurrency(total)}
              className="input text-sm"
              autoFocus
            />
          </div>

          {/* Quick amounts */}
          {quickAmounts.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {quickAmounts.map(amt => (
                <button
                  key={amt}
                  onClick={() => setAmountReceived(amt.toFixed(2))}
                  className="px-2.5 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-orange-100 dark:hover:bg-orange-900/30 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors"
                >
                  M{amt}
                </button>
              ))}
              <button
                onClick={() => setAmountReceived(total.toFixed(2))}
                className="px-2.5 py-1 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-lg font-medium"
              >
                Exact
              </button>
            </div>
          )}

          {/* Change */}
          {cashFloat >= total && cashFloat > 0 && (
            <div className="flex items-center justify-between py-2 px-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <span className="text-sm font-medium text-green-700 dark:text-green-400">Change Due</span>
              <span className="text-lg font-bold text-green-700 dark:text-green-400">{formatCurrency(change)}</span>
            </div>
          )}
          {amountReceived && cashFloat < total && (
            <div className="py-2 px-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <span className="text-sm text-red-600 dark:text-red-400">
                Short by {formatCurrency(total - cashFloat)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Card / Mobile Money */}
      {!splitMode && method !== 'cash' && (
        <div>
          <label className="label text-xs">
            {method === 'card' ? 'Card / Transaction Reference' : 'Mobile Money Reference'}
          </label>
          <input
            type="text"
            value={reference}
            onChange={e => setReference(e.target.value)}
            placeholder="Enter reference number"
            className="input text-sm"
            autoFocus
          />
        </div>
      )}

      {/* Split mode inputs */}
      {splitMode && (
        <div className="space-y-2 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-200 dark:border-indigo-800">
          <p className="text-xs font-medium text-indigo-700 dark:text-indigo-400">Split Payment · Total: {formatCurrency(total)}</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Cash (M)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={splitCash}
                onChange={e => setSplitCash(e.target.value)}
                placeholder="0.00"
                className="input text-sm py-1.5"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Card (M)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={splitCard}
                onChange={e => setSplitCard(e.target.value)}
                placeholder="0.00"
                className="input text-sm py-1.5"
              />
            </div>
          </div>
          {splitCardFloat > 0 && (
            <input
              type="text"
              value={splitRef}
              onChange={e => setSplitRef(e.target.value)}
              placeholder="Card reference number"
              className="input text-sm py-1.5"
            />
          )}
          {splitTotal > 0 && (
            <div className={`text-xs font-medium px-2 py-1 rounded-lg ${
              splitTotal >= total
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
            }`}>
              {splitTotal >= total
                ? `Change: ${formatCurrency(splitChange)}`
                : `Remaining: ${formatCurrency(total - splitTotal)}`
              }
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PaymentPanel;
