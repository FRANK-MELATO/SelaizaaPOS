import React, { useState, useRef, useEffect } from 'react';
import { Search, X, UserPlus, User, Phone } from 'lucide-react';
import toast from 'react-hot-toast';
import { customerService } from '../../services/api';
import useDebounce from '../../hooks/useDebounce';

function CustomerSearch({ selectedCustomer, onSelect, onClear }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '' });
  const [creating, setCreating] = useState(false);
  const containerRef = useRef(null);

  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    customerService.getCustomers({ search: debouncedQuery, limit: 6 })
      .then(res => {
        const list = res?.data || res;
        setResults(Array.isArray(list) ? list : []);
      })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [debouncedQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSelect = (customer) => {
    onSelect(customer);
    setQuery('');
    setResults([]);
    setShowDropdown(false);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newCustomer.name.trim()) {
      toast.error('Customer name is required');
      return;
    }
    setCreating(true);
    try {
      const res = await customerService.createCustomer(newCustomer);
      const created = res?.data || res;
      toast.success('Customer created!');
      handleSelect(created);
      setShowCreateForm(false);
      setNewCustomer({ name: '', phone: '', email: '' });
    } catch (err) {
      toast.error(err.message || 'Failed to create customer');
    } finally {
      setCreating(false);
    }
  };

  if (selectedCustomer) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
        <div className="w-7 h-7 rounded-full bg-orange-600 flex items-center justify-center flex-shrink-0">
          <span className="text-white text-xs font-bold">{selectedCustomer.name?.[0]?.toUpperCase()}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{selectedCustomer.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{selectedCustomer.phone} · {selectedCustomer.loyalty_points || 0} pts</p>
        </div>
        <button
          onClick={onClear}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          aria-label="Remove customer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      {!showCreateForm ? (
        <>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setShowDropdown(true); }}
              onFocus={() => query.length >= 2 && setShowDropdown(true)}
              placeholder="Search customer (optional)..."
              className="input pl-9 py-2 text-sm"
            />
            {loading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            )}
          </div>

          {showDropdown && (results.length > 0 || query.length >= 2) && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-20 overflow-hidden">
              {results.map(customer => (
                <button
                  key={customer.id}
                  onClick={() => handleSelect(customer)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors text-left"
                >
                  <div className="w-7 h-7 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center flex-shrink-0">
                    <span className="text-orange-700 dark:text-orange-400 text-xs font-bold">{customer.name?.[0]?.toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{customer.name}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      {customer.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{customer.phone}</span>}
                      <span>{customer.loyalty_points || 0} pts</span>
                    </div>
                  </div>
                </button>
              ))}
              <button
                onClick={() => { setShowCreateForm(true); setShowDropdown(false); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 border-t border-gray-100 dark:border-gray-700 text-sm font-medium transition-colors"
              >
                <UserPlus className="h-4 w-4" />
                Create new customer
              </button>
            </div>
          )}
        </>
      ) : (
        <form onSubmit={handleCreate} className="space-y-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">New Customer</span>
            <button type="button" onClick={() => setShowCreateForm(false)} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <input
            type="text"
            placeholder="Full name *"
            value={newCustomer.name}
            onChange={e => setNewCustomer(p => ({ ...p, name: e.target.value }))}
            className="input text-sm py-1.5"
            required
            autoFocus
          />
          <input
            type="tel"
            placeholder="Phone number"
            value={newCustomer.phone}
            onChange={e => setNewCustomer(p => ({ ...p, phone: e.target.value }))}
            className="input text-sm py-1.5"
          />
          <input
            type="email"
            placeholder="Email (optional)"
            value={newCustomer.email}
            onChange={e => setNewCustomer(p => ({ ...p, email: e.target.value }))}
            className="input text-sm py-1.5"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={creating} className="btn-primary py-1.5 text-sm flex-1">
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button type="button" onClick={() => setShowCreateForm(false)} className="btn-secondary py-1.5 text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default CustomerSearch;
