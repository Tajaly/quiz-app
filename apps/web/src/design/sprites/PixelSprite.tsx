import { memo, useMemo, type CSSProperties } from 'react';

export type Palette = Readonly<Record<string, string>>;

export interface PixelRun {
  x: number;
  y: number;
  w: number;
  color: string;
}

/** Merges horizontal runs of the same colour so a sprite becomes as few <rect>s as possible. */
export function spriteRuns(rows: readonly string[], palette: Palette): PixelRun[] {
  const runs: PixelRun[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const key = row[x] ?? '.';
      let w = 1;
      while (x + w < row.length && row[x + w] === key) w += 1;
      const color = palette[key];
      if (color) runs.push({ x, y, w, color });
      x += w;
    }
  });
  return runs;
}

export interface PixelSpriteProps {
  rows: readonly string[];
  palette: Palette;
  /** Size of one sprite pixel in CSS pixels. */
  scale?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
  flip?: boolean;
}

export const PixelSprite = memo(function PixelSprite({
  rows,
  palette,
  scale = 4,
  className,
  style,
  title,
  flip,
}: PixelSpriteProps) {
  const width = rows[0]?.length ?? 0;
  const height = rows.length;
  const runs = useMemo(() => spriteRuns(rows, palette), [rows, palette]);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width * scale}
      height={height * scale}
      shapeRendering="crispEdges"
      className={className}
      style={flip ? { ...style, transform: `${style?.transform ?? ''} scaleX(-1)` } : style}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {runs.map((run, index) => (
        <rect key={index} x={run.x} y={run.y} width={run.w} height={1} fill={run.color} />
      ))}
    </svg>
  );
});
