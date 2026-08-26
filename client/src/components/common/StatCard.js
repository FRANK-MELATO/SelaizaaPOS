import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  trendLabel,
  color = 'orange',
  loading = false,
  className = ''
}) {
  const colorMap = {
    orange: {
      bg: 'bg-orange-100 dark:bg-orange-900/30',
      icon: 'text-orange-600 dark:text-orange-400'
    },
    blue: {
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      icon: 'text-blue-600 dark:text-blue-400'
    },
    green: {
      bg: 'bg-green-100 dark:bg-green-900/30',
      icon: 'text-green-600 dark:text-green-400'
    },
    red: {
      bg: 'bg-red-100 dark:bg-red-900/30',
      icon: 'text-red-600 dark:text-red-400'
    },
    purple: {
      bg: 'bg-purple-100 dark:bg-purple-900/30',
      icon: 'text-purple-600 dark:text-purple-400'
    },
    yellow: {
      bg: 'bg-yellow-100 dark:bg-yellow-900/30',
      icon: 'text-yellow-600 dark:text-yellow-400'
    }
  };

  const colors = colorMap[color] || colorMap.orange;

  const TrendIcon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const trendColor = trend > 0 ? 'text-green-600 dark:text-green-400' : trend < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500';

  if (loading) {
    return (
      <div className={`card p-5 ${className}`}>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gray-200 dark:bg-gray-700 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-24" />
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-32" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`card p-5 hover:shadow-md transition-shadow ${className}`}>
      <div className="flex items-center gap-4">
        {Icon && (
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colors.bg}`}>
            <Icon className={`h-6 w-6 ${colors.icon}`} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{label}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-0.5 truncate">{value}</p>
          {trend !== undefined && (
            <div className={`flex items-center gap-1 mt-1 text-sm ${trendColor}`}>
              <TrendIcon className="h-3.5 w-3.5" />
              <span>{trend > 0 ? '+' : ''}{trend}%</span>
              {trendLabel && <span className="text-gray-500 dark:text-gray-400">{trendLabel}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default StatCard;
