import { type ButtonHTMLAttributes, type ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

const variantStyles: Record<string, React.CSSProperties> = {
  primary: { background: 'linear-gradient(135deg, #e85c2c, #e85c2c)', color: '#fff', border: 'none' },
  ghost: { background: 'transparent', color: '#3a3530', border: 'none' },
  outline: { background: 'transparent', color: '#1e1a16', border: '1px solid #c8c0b4' },
};

const sizeStyles: Record<string, React.CSSProperties> = {
  sm: { fontSize: 12, padding: '6px 12px', borderRadius: 8 },
  md: { fontSize: 14, padding: '8px 16px', borderRadius: 12 },
  lg: { fontSize: 16, padding: '12px 24px', borderRadius: 12 },
};

export function Button({ variant = 'primary', size = 'md', children, disabled, style, ...props }: ButtonProps) {
  return (
    <button
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontWeight: 500, cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s', fontFamily: 'inherit',
        opacity: disabled ? 0.5 : 1,
        ...variantStyles[variant],
        ...sizeStyles[size],
        ...style,
      }}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
