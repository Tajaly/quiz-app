import { describe, expect, it } from 'vitest';
import { KART_COLORS, KART_MODELS } from '@power-quiz/shared';
import { ICONS } from './icons';
import { KART_ART, kartPalette } from './kartArt';
import { spriteRuns } from './PixelSprite';

describe('sprite art', () => {
  it('defines a 24×15 sprite for every kart model', () => {
    for (const model of KART_MODELS) {
      const rows = KART_ART[model];
      expect(rows, model).toHaveLength(15);
      for (const row of rows) expect(row, `${model}: "${row}"`).toHaveLength(24);
    }
  });

  it('only uses palette keys that every kart colour defines', () => {
    for (const color of KART_COLORS) {
      const palette = kartPalette(color);
      for (const model of KART_MODELS) {
        for (const char of KART_ART[model].join('')) {
          if (char !== '.') expect(palette[char], `${model}/${color} key "${char}"`).toBeDefined();
        }
      }
    }
  });

  it('defines square 10×10 icons drawn with x only', () => {
    for (const [name, rows] of Object.entries(ICONS)) {
      expect(rows, name).toHaveLength(10);
      for (const row of rows) expect(row, `${name}: "${row}"`).toMatch(/^[.x]{10}$/);
    }
  });
});

describe('spriteRuns', () => {
  it('merges horizontal runs and skips transparent pixels', () => {
    expect(spriteRuns(['aab.', '.bbb'], { a: 'red', b: 'blue' })).toEqual([
      { x: 0, y: 0, w: 2, color: 'red' },
      { x: 2, y: 0, w: 1, color: 'blue' },
      { x: 1, y: 1, w: 3, color: 'blue' },
    ]);
  });
});
