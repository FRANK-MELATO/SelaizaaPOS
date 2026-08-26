import React, { useState, useRef } from 'react';
import { Search, X } from 'lucide-react';
import useDebounce from '../../hooks/useDebounce';

function SearchInput({
  placeholder = 'Search...',
  value,
  onChange,
  onSearch,
  debounce = 300,
  className = '',
  autoFocus = false,
  inputRef: externalRef
}) {
  const [internalValue, setInternalValue] = useState(value || '');
  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : internalValue;
  const localRef = useRef(null);
  const ref = externalRef || localRef;

  const debouncedValue = useDebounce(currentValue, debounce);

  // Call onSearch when debounced value changes
  React.useEffect(() => {
    if (onSearch) onSearch(debouncedValue);
  }, [debouncedValue]); // eslint-disable-line

  const handleChange = (e) => {
    const val = e.target.value;
    if (!isControlled) setInternalValue(val);
    if (onChange) onChange(val);
  };

  const handleClear = () => {
    if (!isControlled) setInternalValue('');
    if (onChange) onChange('');
    if (onSearch) onSearch('');
    ref.current?.focus();
  };

  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
      <input
        ref={ref}
        type="text"
        value={currentValue}
        onChange={handleChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="input pl-9 pr-9"
      />
      {currentValue && (
        <button
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export default SearchInput;
