import React from 'react';

interface CalendarIconProps {
  className?: string;
  size?: number;
}

export const CalendarIcon: React.FC<CalendarIconProps> = ({ className = '', size = 16 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect x="3" y="6" width="18" height="15" rx="2" stroke="currentColor" strokeWidth="2" />
      <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2" />
      <line x1="7" y1="3" x2="7" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="17" y1="3" x2="17" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
};
