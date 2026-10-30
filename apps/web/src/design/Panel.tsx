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
    <section className={cx('px-frame m-1 bg-night-800/95 p-4 sm:p-6', className)} {...props}>
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="font-pixel text-sm leading-relaxed text-sun sm:text-base">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-1">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Heading({ className, children }: { className?: string; children: ReactNode }) {
  return <h1 className={cx('px-text-outline font-pixel leading-snug text-white', className)}>{children}</h1>;
}

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={cx(
        'px-frame m-1 inline-flex items-center gap-1.5 bg-night-950 px-2 py-1 font-pixel text-[10px] uppercase text-mist',
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
    info: 'bg-night-600 text-white',
    error: 'bg-flame text-white',
    success: 'bg-lime text-ink',
  } as const;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx('px-frame m-1 px-4 py-3 font-semibold', tones[tone], className)}
    >
      {children}
    </div>
  );
}
