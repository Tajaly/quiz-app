import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';

export function Panel({
  title,
  actions,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & { title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cx('game-panel min-w-0 p-4 sm:p-6', className)} {...props}>
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="font-display text-2xl font-bold leading-tight text-ink">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-1">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Heading({ className, children }: { className?: string; children: ReactNode }) {
  return <h1 className={cx('font-display font-bold leading-snug text-ink', className)}>{children}</h1>;
}

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full bg-sky-soft px-3 py-1 text-xs font-semibold text-sky-dark',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Notice({
  tone = 'info',
  className,
  children,
}: {
  tone?: 'info' | 'error' | 'success';
  className?: string;
  children: ReactNode;
}) {
  const tones = {
    info: 'bg-sky-soft text-sky-dark',
    error: 'bg-flame-soft text-flame-dark',
    success: 'bg-lime-soft text-leaf',
  } as const;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx('rounded-xl px-4 py-3 text-sm font-semibold leading-relaxed', tones[tone], className)}
    >
      {children}
    </div>
  );
}
