import React from 'react';

interface ClockIconProps {
  className?: string;
  size?: number;
}

export const ClockIcon: React.FC<ClockIconProps> = ({ className = '', size = 16 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7V12L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
};
