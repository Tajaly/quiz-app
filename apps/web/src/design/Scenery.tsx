import type { Kart as KartChoice } from '@power-quiz/shared';
import { cx } from '../lib/cx';
import { Kart } from './sprites/Sprites';

const PARADE: Array<{ kart: KartChoice; delay: string; duration: string }> = [
  { kart: { model: 'classic', color: 'red' }, delay: '0s', duration: '7s' },
  { kart: { model: 'rocket', color: 'cyan' }, delay: '-2.5s', duration: '5.5s' },
  { kart: { model: 'buggy', color: 'yellow' }, delay: '-4.6s', duration: '8s' },
  { kart: { model: 'bubble', color: 'pink' }, delay: '-1.2s', duration: '9s' },
];

/** A strip of road with karts racing across; purely decorative. */
export function RoadStrip({ className }: { className?: string }) {
  return (
    <div
      className={cx('relative h-24 overflow-hidden border-y-4 border-ink bg-[#3a3550]', className)}
      aria-hidden
    >
      <div className="absolute inset-x-0 top-0 h-2 px-checkered opacity-90" />
      <div className="px-road animate-road absolute inset-x-0 top-1/2 h-1" />
      {PARADE.map((item, index) => (
        <div
          key={index}
          className="animate-drive absolute"
          style={{
            bottom: index % 2 === 0 ? '10px' : '38px',
            animationDelay: item.delay,
            animationDuration: item.duration,
          }}
        >
          <Kart kart={item.kart} scale={3} title={false} />
        </div>
      ))}
      <div className="absolute inset-x-0 bottom-0 h-2 px-checkered opacity-90" />
    </div>
  );
}

export function StartingLine({ className }: { className?: string }) {
  return <div className={cx('px-checkered h-3 w-full', className)} aria-hidden />;
}
