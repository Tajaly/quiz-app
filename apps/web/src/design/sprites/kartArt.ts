import type { KartColor, KartModel } from '@power-quiz/shared';
import type { Palette } from './PixelSprite';

/*
 * Original side-view pixel karts (24×15, facing right). Legend:
 * k outline · b/d/l body base/dark/light (kart colour) · w helmet · v visor · s visor shine
 * c glass dome · g metal · t tyre · r rim · y headlight · o/f exhaust flame
 */
export const KART_ART: Record<KartModel, readonly string[]> = {
  classic: [
    '.........kkkkk..........',
    '........kwwwwwk.........',
    '.......kwbbbwwwk........',
    '.......kwwwwwvvk........',
    '.......kwwwwwvsk........',
    '.kkkk...kwwwwwk.........',
    '.kllk....kdddk..........',
    '..kgk...kdbbbdk..kk.....',
    '..kgkkkkkbbbbbkkkgkkk...',
    '..kbbbbbbbbbbbbbbbbblyk.',
    '.kdkkkkddddddddddkkkkdk.',
    '..kttttkkkkkkkkkkttttk..',
    '..ktrrtk........ktrrtk..',
    '..kttttk........kttttk..',
    '...kkkk..........kkkk...',
  ],
  rocket: [
    '.........kkkkk..........',
    '........kwwwwwk.........',
    '.......kwbbbwwwk........',
    '.......kwwwwwvvk........',
    '.......kwwwwwvsk........',
    '........kwwwwwk.........',
    '.........kdddk..........',
    '..kkkk..kdbbbdk.........',
    '.kggggkkkbbbbbkkkkkk....',
    'fkggggbbbbbbbbbbbbbbllk.',
    'okggggddddddddddddddddyk',
    'fkkkkkkkkkkkkkkkkkkkkkk.',
    '..ktrrtk........ktrrtk..',
    '..kttttk........kttttk..',
    '...kkkk..........kkkk...',
  ],
  buggy: [
    '......kkkkkkkkkk........',
    '......k..kkkkk.k........',
    '......k.kwwwwwkk........',
    '......kkwbbbwvvk........',
    '......kkwwwwwvsk........',
    '......k.kwwwwwkk........',
    '......k..kdddk.k..kk....',
    '..kkkkkkkkbbbbbkkkkgkkk.',
    '..kbbbbbbbbbbbbbbbbbbblk',
    '..kddddddddddddddddddddk',
    '..kkkkk..........kkkkk..',
    '.kttrttk........kttrttk.',
    '.ktrrrtk........ktrrrtk.',
    '.kttrttk........kttrttk.',
    '..kkkkk..........kkkkk..',
  ],
  bolt: [
    '........................',
    '........................',
    '........................',
    '..........kkkkk.........',
    '.kkkkk...kwwwwwk........',
    '.kllllk.kwbbbwwvk.......',
    '..kkkk..kwwwwwvsk.......',
    '...kk...kkkkkkkkk..kk...',
    '...kgkkkkbbbbbbbbkkkgk..',
    '..kbbbbbbbbbbbbbbbbbbllk',
    '..kdddddddddddddddddddyk',
    '..kkkkkkkkkkkkkkkkkkkkk.',
    '..ktrrtk........ktrrtk..',
    '..kttttk........kttttk..',
    '...kkkk..........kkkk...',
  ],
  truck: [
    '.kk.....................',
    '.kgk..kkkkkkkkkkkk......',
    '.kgk..kbbbbbbbbbbk......',
    '.kgk..kbkkkkkkkkbk......',
    '.kgk..kbkwwbwvskbk......',
    '.kgk..kbkwwwwvvkbk......',
    '.kgkkkkbkkkkkkkkbkkkkk..',
    '.kbbbbbbbbbbbbbbbbbbbbk.',
    '.kbbbbbbbbbbbbbbbbbbblyk',
    '.kddddddddddddddddddddk.',
    '.kgggkkkkkkkkkkkkkkgggk.',
    '.kttrttk........kttrttk.',
    '.ktrrrtk........ktrrrtk.',
    '.kttrttk........kttrttk.',
    '..kkkkk..........kkkkk..',
  ],
  bubble: [
    '........................',
    '..........kkkkkk........',
    '........kksscccckk......',
    '.......ksscwwwwcck......',
    '......kscwwbbwvvcck.....',
    '......kccwwwwvsccck.....',
    '......kcccwwwwcccck.....',
    '....kkkkkkkkkkkkkkkkk...',
    '...kbbbbbbbbbbbbbbbbblk.',
    '..kbbbbbbbbbbbbbbbbbbbyk',
    '..kdddddddddddddddddddk.',
    '...kkkkkkkkkkkkkkkkkkk..',
    '....ktrtk.......ktrtk...',
    '....ktttk.......ktttk...',
    '.....kkk.........kkk....',
  ],
};

const SHARED_COLORS = {
  k: '#120a24',
  w: '#f4f4f8',
  v: '#2e1f63',
  s: '#9ff3ff',
  c: '#8fd3ff',
  g: '#9aa3c2',
  t: '#2a2540',
  r: '#c9cfe0',
  y: '#ffe066',
  o: '#f77622',
  f: '#fee761',
} as const;

export const KART_COLOR_TONES: Record<KartColor, { b: string; d: string; l: string }> = {
  red: { b: '#e43b44', d: '#a22633', l: '#ff9a9f' },
  blue: { b: '#1e88e5', d: '#124e89', l: '#8fd0ff' },
  green: { b: '#63c74d', d: '#2d8a3e', l: '#c1f29b' },
  yellow: { b: '#ffc93c', d: '#d98e04', l: '#fff3a3' },
  purple: { b: '#9b5de5', d: '#5a2d91', l: '#d6b4ff' },
  orange: { b: '#f77622', d: '#b4451c', l: '#ffc08a' },
  pink: { b: '#ff6fb5', d: '#c2387f', l: '#ffc8e3' },
  cyan: { b: '#2ce8f5', d: '#0a8fb0', l: '#c5fcff' },
};

const paletteCache = new Map<KartColor, Palette>();

export function kartPalette(color: KartColor): Palette {
  let palette = paletteCache.get(color);
  if (!palette) {
    palette = { ...SHARED_COLORS, ...KART_COLOR_TONES[color] };
    paletteCache.set(color, palette);
  }
  return palette;
}
