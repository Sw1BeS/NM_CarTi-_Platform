import React from 'react';

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', children, ...rest }) => (
  <div className={`panel bg-[var(--bg-panel)] border border-[var(--border-color)] ${className}`} {...rest}>
    {children}
  </div>
);
