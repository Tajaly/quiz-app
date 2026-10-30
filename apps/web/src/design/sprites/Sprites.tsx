import type { Kart as KartChoice } from '@power-quiz/shared';
import { KART_MODEL_LABELS, KART_COLOR_LABELS } from '@power-quiz/shared';
import { memo, type CSSProperties } from 'react';
import { cx } from '../../lib/cx';
import { ICONS, type IconName } from './icons';
import { KART_ART, kartPalette } from './kartArt';
import { PixelSprite } from './PixelSprite';
import { REFEREE_ART, REFEREE_PALETTE } from './refereeArt';

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

export const DogReferee = memo(function DogReferee({
  className,
  pose = 'idle',
}: {
  className?: string;
  pose?: 'idle' | 'finish';
}) {
  return (
    <svg
      viewBox="0 0 76 64"
      width={152}
      height={128}
      className={cx('dog-referee', className)}
      shapeRendering="crispEdges"
      role="img"
      aria-label="Dog referee with a chequered finish flag"
      focusable="false"
      data-testid="dog-referee"
      data-pose={pose}
    >
      <rect x={13} y={59} width={24} height={2} opacity={0.15} fill={REFEREE_PALETTE.k} />
      <g transform="translate(10 42)">
        <g className="dog-referee__tail">
          <PixelSprite rows={REFEREE_ART.tail} palette={REFEREE_PALETTE} scale={2} />
        </g>
      </g>
      <g transform="translate(38 13)">
        <g className="dog-referee__flag">
          <rect x={0} y={0} width={2} height={35} fill={REFEREE_PALETTE.k} />
          <rect x={1} y={-1} width={20} height={14} fill={REFEREE_PALETTE.k} />
          <g transform="translate(2 0)">
            <PixelSprite rows={REFEREE_ART.flag} palette={REFEREE_PALETTE} scale={1} />
          </g>
        </g>
      </g>
      <g transform="translate(8 18)">
        <PixelSprite rows={REFEREE_ART.body} palette={REFEREE_PALETTE} scale={2} />
      </g>
      <g transform="translate(16 28)">
        <g className="dog-referee__eyes">
          <PixelSprite rows={REFEREE_ART.eyes} palette={REFEREE_PALETTE} scale={2} />
        </g>
      </g>
    </svg>
  );
});
