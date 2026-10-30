import { cx } from '../lib/cx';
import { DogReferee, Kart } from './sprites/Sprites';

const CIRCUIT = 'M183 115H537a70 70 0 0 1 0 140H183a70 70 0 0 1 0-140Z';

export function RaceScene({ className }: { className?: string }) {
  return (
    <div className={cx('race-scene', className)} aria-hidden="true">
      <svg viewBox="0 0 720 320" fill="none" focusable="false">
        <circle cx="628" cy="40" r="23" fill="#ffd45b" />
        <g fill="white">
          <path d="M49 58a18 18 0 0 1 0-36 25 25 0 0 1 47-5 19 19 0 0 1 27 17h9a12 12 0 0 1 0 24Z" />
          <path d="M365 52a12 12 0 0 1 0-24 19 19 0 0 1 35-8 15 15 0 0 1 23 14h10a9 9 0 0 1 0 18Z" />
          <path d="M627 95a13 13 0 0 1 0-26 20 20 0 0 1 37-6 15 15 0 0 1 23 14 9 9 0 0 1 0 18Z" />
        </g>
        <rect x="57" y="71" width="606" height="233" rx="116" fill="#c2e8a7" />
        <path d={CIRCUIT} stroke="white" strokeWidth="74" />
        <path d={CIRCUIT} stroke="#ed777b" strokeWidth="74" strokeDasharray="15 15" />
        <path d={CIRCUIT} stroke="#7893ab" strokeWidth="58" />
        <path d={CIRCUIT} stroke="#eaf3fa" strokeWidth="3" strokeDasharray="16 14" />
        <g transform="translate(491 226)">
          <rect width="24" height="58" fill="white" />
          {Array.from({ length: 10 }, (_, index) => (
            <rect
              key={index}
              x={(index % 2) * 12}
              y={Math.floor(index / 2) * 12}
              width="12"
              height="12"
              fill={index % 4 === 0 || index % 4 === 3 ? '#19354d' : 'white'}
            />
          ))}
        </g>
        <g fill="#79b966">
          <rect x="223" y="166" width="6" height="14" rx="3" />
          <rect x="236" y="171" width="6" height="9" rx="3" />
          <rect x="479" y="176" width="6" height="14" rx="3" />
          <rect x="492" y="181" width="6" height="9" rx="3" />
        </g>
      </svg>
      <div className="circuit-kart circuit-kart-red">
        <Kart kart={{ model: 'classic', color: 'red' }} scale={6} title={false} />
      </div>
      <div className="circuit-kart circuit-kart-blue">
        <Kart kart={{ model: 'rocket', color: 'cyan' }} scale={5} flip title={false} />
      </div>
      <div className="circuit-kart circuit-kart-yellow">
        <Kart kart={{ model: 'buggy', color: 'yellow' }} scale={4} title={false} />
      </div>
      <div className="circuit-referee">
        <DogReferee />
      </div>
    </div>
  );
}

export function StartingLine({ className }: { className?: string }) {
  return <div className={cx('px-checkered h-3 w-full', className)} aria-hidden="true" />;
}
