import {
  KART_COLORS,
  KART_COLOR_LABELS,
  KART_MODELS,
  KART_MODEL_LABELS,
  type Kart as KartChoice,
} from '@power-quiz/shared';
import { cx } from '../../lib/cx';
import { Kart } from '../../design/sprites/Sprites';
import { KART_COLOR_TONES } from '../../design/sprites/kartArt';
import { StartingLine } from '../../design/Scenery';

export function KartGarage({ value, onChange }: { value: KartChoice; onChange: (kart: KartChoice) => void }) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-2 text-sm font-semibold text-mist">Pick your kart</legend>

      <div className="px-frame m-1 flex flex-col items-center bg-night-950 px-4 pt-6">
        <div className="animate-bob">
          <Kart kart={value} scale={7} className="max-w-full" />
        </div>
        <StartingLine className="mt-1" />
        <p className="py-2 font-pixel text-[10px] uppercase text-mist" aria-live="polite">
          {KART_COLOR_LABELS[value.color]} {KART_MODEL_LABELS[value.model]}
        </p>
      </div>

      <div role="radiogroup" aria-label="Kart model" className="grid grid-cols-3 gap-2">
        {KART_MODELS.map((model) => {
          const selected = value.model === model;
          return (
            <button
              key={model}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={KART_MODEL_LABELS[model]}
              onClick={() => onChange({ ...value, model })}
              className={cx(
                'px-frame m-1 flex flex-col items-center gap-1 p-2 transition-colors',
                selected ? 'bg-night-500 [--px-color:var(--color-sun)]' : 'bg-night-700 hover:bg-night-600',
              )}
            >
              <Kart kart={{ model, color: value.color }} scale={2} title={false} />
              <span className="text-xs font-semibold">{KART_MODEL_LABELS[model]}</span>
            </button>
          );
        })}
      </div>

      <div role="radiogroup" aria-label="Kart colour" className="flex flex-wrap justify-center gap-1">
        {KART_COLORS.map((color) => {
          const selected = value.color === color;
          return (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={KART_COLOR_LABELS[color]}
              title={KART_COLOR_LABELS[color]}
              onClick={() => onChange({ ...value, color })}
              className={cx('px-frame m-1.5 h-9 w-9', selected && '[--px-color:white] scale-110')}
              style={{ backgroundColor: KART_COLOR_TONES[color].b }}
            />
          );
        })}
      </div>
    </fieldset>
  );
}
