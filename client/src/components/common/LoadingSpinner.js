import React from 'react';

const sizeMap = {
  sm: 'h-4 w-4 border-2',
  md: 'h-8 w-8 border-2',
  lg: 'h-12 w-12 border-4',
  xl: 'h-16 w-16 border-4'
};

function LoadingSpinner({ size = 'md', centered = true, label }) {
  const spinner = (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`${sizeMap[size]} rounded-full border-orange-200 border-t-orange-600 animate-spin`}
        role="status"
        aria-label={label || 'Loading...'}
      />
      {label && (
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      )}
    </div>
  );

  if (centered) {
    return (
      <div className="flex items-center justify-center w-full py-12">
        {spinner}
      </div>
    );
  }

  return spinner;
}

export default LoadingSpinner;
