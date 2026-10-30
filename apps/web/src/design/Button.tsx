import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon } from './sprites/Sprites';
import type { IconName } from './sprites/icons';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-sun text-ink hover:bg-[#ffd666]',
  secondary: 'bg-night-600 text-white hover:bg-night-500',
  danger: 'bg-flame text-white hover:bg-[#f0545c]',
  success: 'bg-lime text-ink hover:bg-[#7cd967]',
  ghost: 'bg-transparent text-mist hover:bg-white/10 hover:text-white',
};

const SIZES: Record<ButtonSize, { button: string; icon: number }> = {
  sm: { button: 'min-h-9 px-3 text-sm gap-1.5', icon: 1.6 },
  md: { button: 'min-h-11 px-4 text-base gap-2', icon: 2 },
  lg: { button: 'min-h-14 px-6 text-xl gap-2.5', icon: 2.4 },
  xl: { button: 'min-h-20 px-8 text-3xl gap-3', icon: 3.2 },
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  children?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  className,
  children,
  type,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={cx(
        'm-1 inline-flex select-none items-center justify-center font-sans font-bold uppercase tracking-wide',
        'transition-[transform,background-color] duration-75 active:translate-y-1',
        'disabled:pointer-events-none disabled:opacity-45',
        variant !== 'ghost' && 'px-frame-raised',
        VARIANTS[variant],
        SIZES[size].button,
        className,
      )}
      {...props}
    >
      {icon && <Icon name={icon} size={SIZES[size].icon} />}
      {children}
    </button>
  );
}
