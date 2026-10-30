import type { Kart as KartChoice } from '@power-quiz/shared';
import { KART_MODEL_LABELS, KART_COLOR_LABELS } from '@power-quiz/shared';
import type { CSSProperties } from 'react';
import { ICONS, type IconName } from './icons';
import { KART_ART, kartPalette } from './kartArt';
import { PixelSprite } from './PixelSprite';

const ICON_PALETTE = { x: 'currentColor' } as const;

export function Icon({
  name,
  size = 2,
  className,
  title,
}: {
  name: IconName;
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <PixelSprite rows={ICONS[name]} palette={ICON_PALETTE} scale={size} className={className} title={title} />
  );
}

export function Kart({
  kart,
  scale = 4,
  className,
  style,
  title,
  flip,
}: {
  kart: KartChoice;
  scale?: number;
  className?: string;
  style?: CSSProperties;
  title?: string | false;
  flip?: boolean;
}) {
  const label =
    title === false
      ? undefined
      : (title ?? `${KART_COLOR_LABELS[kart.color]} ${KART_MODEL_LABELS[kart.model]} kart`);
  return (
    <PixelSprite
      rows={KART_ART[kart.model]}
      palette={kartPalette(kart.color)}
      scale={scale}
      className={className}
      style={style}
      title={label}
      flip={flip}
    />
  );
}
