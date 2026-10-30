import type { Palette } from './PixelSprite';

export const REFEREE_PALETTE = {
  k: '#27364c',
  w: '#fff7e4',
  h: '#ffffff',
  r: '#cf4759',
  p: '#f2b8b0',
} as const satisfies Palette;

export const REFEREE_ART: Record<'body' | 'eyes' | 'tail' | 'flag', readonly string[]> = {
  // Chunky cartoon proportions, with a big head and no fur texture or shaded outlines.
  body: [
    '......kkkk......',
    '....kkwwwwkk....',
    '..kkwwwwwwwwkk..',
    '.kkkkkwwwwwwwkk.',
    'kkkkkkwwwwwwwkkk',
    'kkkkkkwwwwwwwkkk',
    'kkkkkkwwwwwwwkkk',
    '.kkkkwwwwwwwwkk.',
    '.kkwpwwkkwwpwkk.',
    '..kwwwwwkwwwwk..',
    '...kwwkppkwwk...',
    '....kkwwwwkk....',
    '.....krrrrk.....',
    '....kwwrhwwk....',
    '....kwwhrwwwkwk.',
    '....kwwrrwwkkk..',
    '....kwwwwwwk....',
    '....kwwwwwwk....',
    '...kwwwkkwwwk...',
    '...kkkk..kkkk...',
  ],
  eyes: ['hk....hk', 'kk....kk'],
  tail: ['.kk..', 'kwwk.', 'kw.k.', '.kwwk', '..kwk', '...k.'],
  flag: [
    'kkkhhhkkkhhhkkkhhh',
    'kkkhhhkkkhhhkkkhhh',
    'kkkhhhkkkhhhkkkhhh',
    'hhhkkkhhhkkkhhhkkk',
    'hhhkkkhhhkkkhhhkkk',
    'hhhkkkhhhkkkhhhkkk',
    'kkkhhhkkkhhhkkkhhh',
    'kkkhhhkkkhhhkkkhhh',
    'kkkhhhkkkhhhkkkhhh',
    'hhhkkkhhhkkkhhhkkk',
    'hhhkkkhhhkkkhhhkkk',
    'hhhkkkhhhkkkhhhkkk',
  ],
};
