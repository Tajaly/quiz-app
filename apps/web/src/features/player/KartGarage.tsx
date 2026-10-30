import { useId } from 'react';
import {
  KART_COLORS,
  KART_COLOR_LABELS,
  KART_MODELS,
  KART_MODEL_LABELS,
  type Kart as KartChoice,
} from '@power-quiz/shared';
import { cx } from '../../lib/cx';
import { Icon, Kart } from '../../design/sprites/Sprites';
import { KART_COLOR_TONES } from '../../design/sprites/kartArt';
import { StartingLine } from '../../design/Scenery';

export function KartGarage({ value, onChange }: { value: KartChoice; onChange: (kart: KartChoice) => void }) {
  const groupId = useId();
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-2 text-sm font-semibold text-mist">Pick your kart</legend>

      <div className="kart-showcase flex flex-col items-center px-4 pt-6">
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
            <label
              key={model}
              className={cx(
                'garage-model flex flex-col items-center justify-center gap-2 p-2',
                selected && 'text-sky-dark',
              )}
            >
              <input
                type="radio"
                name={`${groupId}-model`}
                value={model}
                checked={selected}
                aria-label={KART_MODEL_LABELS[model]}
                onChange={() => onChange({ ...value, model })}
                className="sr-only"
              />
              <Kart kart={{ model, color: value.color }} scale={2} title={false} />
              <span className="text-xs font-semibold">{KART_MODEL_LABELS[model]}</span>
            </label>
          );
        })}
      </div>

      <div role="radiogroup" aria-label="Kart colour" className="flex flex-wrap justify-center gap-3 p-1">
        {KART_COLORS.map((color) => {
          const selected = value.color === color;
          return (
            <label
              key={color}
              title={KART_COLOR_LABELS[color]}
              className="garage-swatch"
              style={{ backgroundColor: KART_COLOR_TONES[color].b }}
            >
              <input
                type="radio"
                name={`${groupId}-color`}
                value={color}
                checked={selected}
                aria-label={KART_COLOR_LABELS[color]}
                onChange={() => onChange({ ...value, color })}
                className="sr-only"
              />
              {selected && (
                <span className="rounded-full bg-ink p-1 text-white">
                  <Icon name="check" size={1} />
                </span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
