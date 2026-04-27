import { type HTMLAttributes, type ReactNode } from 'react';
import { clsx } from 'clsx';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  hoverable?: boolean;
  padding?: 'sm' | 'md' | 'lg' | 'none';
}

const paddings = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-6',
};

export function Card({ children, hoverable = false, padding = 'md', className, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        'bg-white rounded-2xl border border-surface-200',
        hoverable && 'hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer',
        paddings[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
