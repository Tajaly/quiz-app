import { useMemo } from 'react';
import { cx } from '../lib/cx';
import { Icon } from './sprites/Sprites';

export function Spinner({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      className={cx('flex flex-col items-center justify-center gap-3 p-8 text-mist', className)}
    >
      <Icon name="tire" size={4} className="animate-spin-steps" />
      <span className="font-pixel text-xs">{label}</span>
    </div>
  );
}

export function TimerBar({
  remainingMs,
  totalMs,
  className,
}: {
  remainingMs: number;
  totalMs: number;
  className?: string;
}) {
  const ratio = totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0;
  const seconds = Math.ceil(remainingMs / 1000);
  const color = ratio > 0.5 ? 'bg-lime' : ratio > 0.25 ? 'bg-sun' : 'bg-flame';
  const segments = 20;
  const filled = Math.ceil(ratio * segments);
  return (
    <div className={cx('flex items-center gap-3', className)}>
      <div
        className="px-frame m-1 flex h-6 flex-1 gap-1 bg-night-950 p-1"
        role="progressbar"
        aria-label="Time left"
        aria-valuemin={0}
        aria-valuemax={Math.round(totalMs / 1000)}
        aria-valuenow={seconds}
      >
        {Array.from({ length: segments }, (_, index) => (
          <span key={index} className={cx('h-full flex-1', index < filled ? color : 'bg-night-700')} />
        ))}
      </div>
      <span
        className={cx(
          'w-16 text-right font-pixel text-2xl tabular-nums',
          ratio <= 0.25 ? 'text-flame' : 'text-white',
        )}
        aria-hidden
      >
        {seconds}
      </span>
    </div>
  );
}

export type LightState = 'ready' | 'set' | 'go';

export function lightStateFor(remainingMs: number): LightState {
  if (remainingMs > 2000) return 'ready';
  if (remainingMs > 1000) return 'set';
  return 'go';
}

const LIGHT_LABELS: Record<LightState, string> = { ready: 'Ready', set: 'Set', go: 'Go!' };

export function TrafficLight({ state, size = 'lg' }: { state: LightState; size?: 'md' | 'lg' }) {
  const lamp = size === 'lg' ? 'h-16 w-16 sm:h-24 sm:w-24' : 'h-10 w-10';
  const lamps: Array<{ on: boolean; color: string }> = [
    { on: true, color: 'bg-flame shadow-[0_0_32px_8px_rgb(228_59_68/0.7)]' },
    { on: state !== 'ready', color: 'bg-sun shadow-[0_0_32px_8px_rgb(255_201_60/0.7)]' },
    { on: state === 'go', color: 'bg-lime shadow-[0_0_32px_8px_rgb(99_199_77/0.7)]' },
  ];
  return (
    <div className="flex flex-col items-center gap-4" role="status" aria-live="assertive">
      <div className="px-frame m-1 flex gap-3 bg-ink p-3 sm:gap-4 sm:p-4">
        {lamps.map((item, index) => (
          <span
            key={index}
            className={cx('px-frame m-1 block', lamp, item.on ? item.color : 'bg-night-700')}
          />
        ))}
      </div>
      <span key={state} className="px-text-outline animate-pop font-pixel text-4xl text-white sm:text-6xl">
        {LIGHT_LABELS[state]}
      </span>
    </div>
  );
}

const CONFETTI_COLORS = ['#ffc93c', '#e43b44', '#2ce8f5', '#63c74d', '#ff6fb5', '#9b5de5', '#ffffff'];

/** Deterministic pseudo-random numbers so renders stay pure. */
function seeded(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export function Confetti({ pieces = 70 }: { pieces?: number }) {
  const items = useMemo(
    () =>
      Array.from({ length: pieces }, (_, index) => ({
        left: seeded(index, 1) * 100,
        delay: seeded(index, 2) * 2.5,
        duration: 2.8 + seeded(index, 3) * 2.5,
        size: 6 + Math.round(seeded(index, 4) * 3) * 3,
        drift: (seeded(index, 5) - 0.5) * 160,
        color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
      })),
    [pieces],
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden motion-reduce:hidden" aria-hidden>
      {items.map((item, index) => (
        <span
          key={index}
          className="absolute top-0 block"
          style={{
            left: `${item.left}%`,
            width: item.size,
            height: item.size,
            backgroundColor: item.color,
            animation: `pq-confetti ${item.duration}s linear ${item.delay}s infinite`,
            ['--drift' as string]: `${item.drift}px`,
          }}
        />
      ))}
    </div>
  );
}

export function Logo({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizes = { sm: 'text-sm', md: 'text-xl sm:text-2xl', lg: 'text-3xl sm:text-5xl lg:text-6xl' } as const;
  return (
    <span className={cx('inline-flex items-center gap-3 font-pixel leading-tight', sizes[size], className)}>
      <Icon name="flag" size={size === 'lg' ? 5 : size === 'md' ? 3 : 2} className="text-white" />
      <span className="px-text-outline text-sun">
        POWER<span className="text-white">QUIZ</span>
      </span>
    </span>
  );
}
