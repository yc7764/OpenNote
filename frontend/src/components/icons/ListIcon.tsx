import React from 'react';

interface ListIconProps {
  className?: string;
  size?: number;
}

export const ListIcon: React.FC<ListIconProps> = ({ className = '', size = 20 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <line x1="8" y1="6" x2="21" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="8" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="8" y1="18" x2="21" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="3" y="5" width="2" height="2" rx="1" fill="currentColor" />
      <rect x="3" y="11" width="2" height="2" rx="1" fill="currentColor" />
      <rect x="3" y="17" width="2" height="2" rx="1" fill="currentColor" />
    </svg>
  );
};
