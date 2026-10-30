import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon } from './sprites/Sprites';
import type { IconName } from './sprites/icons';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-sun text-ink hover:bg-[#ffe18a]',
  secondary: 'bg-sky-soft text-sky-dark hover:bg-surface-strong',
  danger: 'bg-flame text-white hover:bg-flame-dark',
  success: 'bg-lime text-ink hover:bg-[#a8df89]',
  ghost: 'rounded-xl bg-transparent text-mist hover:bg-sky-soft hover:text-ink',
};

const SIZES: Record<ButtonSize, { button: string; icon: number }> = {
  sm: { button: 'min-h-11 px-3 text-sm gap-1.5', icon: 1.6 },
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
        'm-1 inline-flex select-none items-center justify-center font-sans font-bold',
        'transition-[transform,background-color] duration-150 active:translate-y-0.5',
        'disabled:pointer-events-none disabled:opacity-50',
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
