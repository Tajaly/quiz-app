/**
 * Original chiptune songs for the shared screen, written as readable step patterns.
 *
 * Melodic parts are bar strings of whitespace-separated tokens, one per 16th step:
 * a note (`C5`, `F#4`, `Bb3`) starts a note, `-` holds the previous note and `.` is a rest.
 * Drum lanes use one character per step: `x` hit, `X` accented hit, `o` open hi-hat, `.` silence.
 */
import { midiToNote, noteToMidi, type Wave } from './synth';

export type SongName = 'lobby' | 'race' | 'results';
export type Instrument = 'lead' | 'harmony' | 'bass' | 'kick' | 'snare' | 'hat' | 'openHat';

export interface NoteEvent {
  instrument: Instrument;
  /** MIDI note number (0 for drums). */
  midi: number;
  /** Written length in 16th steps. */
  length: number;
  accent: boolean;
}

export interface Song {
  bpm: number;
  /** Delay of every off-beat 16th as a fraction of a step (0 = straight). */
  swing: number;
  /** Send level of the lead into a dotted-8th echo (0 = dry). */
  echo: number;
  leadWave: Wave;
  harmonyWave: Wave;
  /** Loop length in 16th steps. */
  length: number;
  /** Events starting on each step. */
  steps: NoteEvent[][];
}

export interface SongSource {
  bpm: number;
  swing?: number;
  echo?: number;
  leadWave?: Wave;
  harmonyWave?: Wave;
  lead: readonly string[];
  harmony?: readonly string[];
  bass: readonly string[];
  kick: readonly string[];
  snare: readonly string[];
  hat: readonly string[];
}

export function splitTokens(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** Writes a bar from semitone offsets relative to `root`: riff('0 - 12 .', 'A2') → 'A2 - A3 .'. */
function riff(pattern: string, root: string): string {
  const base = noteToMidi(root) ?? 60;
  return splitTokens(pattern)
    .map((token) => (token === '-' || token === '.' ? token : midiToNote(base + Number(token))))
    .join(' ');
}

function repeat(count: number, bar: string): string[] {
  return Array.from({ length: count }, () => bar);
}

// ---------------------------------------------------------------------------------------------
// Lobby: relaxed, lightly swung waiting-room groove in F major. 16 bars, A + A' phrase.
// Chords: Bbmaj7 C Am7 Dm7 | Gm7 C7 Fmaj7 Gm7-C7 | Bbmaj7 C Am7 Dm7 | Gm7 C7 Fmaj7 F-F7

const LOBBY_LEAD_OPENING = [
  '.   .   D5  -   F5  -   A5  -   -   -   -   -   G5  -   F5  -', // Bbmaj7
  'G5  -   -   -   E5  -   C5  -   -   -   .   .   C5  -   D5  -', // C
  'E5  -   -   -   .   .   C5  -   E5  -   G5  -   -   -   A5  -', // Am7
  '-   -   F5  -   -   -   -   -   .   .   .   .   .   .   C5  D5', // Dm7
];

const LOBBY_LEAD = [
  ...LOBBY_LEAD_OPENING,
  'F5  -   -   -   D5  -   -   -   Bb4 -   D5  -   F5  -   G5  -', // Gm7
  '-   -   -   -   E5  -   G5  -   Bb5 -   -   -   A5  -   G5  -', // C7
  'A5  -   -   -   -   -   -   -   .   .   C6  -   A5  -   F5  -', // Fmaj7
  'G5  -   -   -   F5  -   D5  -   E5  -   -   -   .   .   C5  -', // Gm7 | C7
  ...LOBBY_LEAD_OPENING,
  'Bb5 -   -   -   A5  -   G5  -   F5  -   G5  -   -   -   D5  -', // Gm7
  'E5  -   -   -   G5  -   -   -   Bb5 -   A5  -   G5  -   E5  -', // C7
  'F5  -   -   -   -   -   -   -   A5  -   -   -   C6  -   -   -', // Fmaj7
  'A5  -   -   -   -   -   -   -   .   .   Eb5 -   D5  -   C5  -', // F | F7
];

const LOBBY_BASS_BAR = '0 - - . 12 - . . 7 - - . 12 - 0 -';
const LOBBY_BASS_HALF = '0 - - . 12 - 7 -';
const LOBBY_BASS_PHRASE = ['Bb2', 'C3', 'A2', 'D3', 'G2', 'C3', 'F2'].map((root) =>
  riff(LOBBY_BASS_BAR, root),
);
const LOBBY_BASS = [
  ...LOBBY_BASS_PHRASE,
  `${riff(LOBBY_BASS_HALF, 'G2')} ${riff(LOBBY_BASS_HALF, 'C3')}`,
  ...LOBBY_BASS_PHRASE,
  `${riff(LOBBY_BASS_HALF, 'F2')} ${riff('0 - 4 - 7 - 10 -', 'F2')}`, // walk up into Bbmaj7
];

const PLUCK_MAJ7 = '0 . 4 . 7 . 11 . 12 . 11 . 7 . 4 .';
const PLUCK_MAJ = '0 . 4 . 7 . 12 . 16 . 12 . 7 . 4 .';
const PLUCK_MIN7 = '0 . 3 . 7 . 10 . 12 . 10 . 7 . 3 .';
const PLUCK_DOM7 = '0 . 4 . 7 . 10 . 12 . 10 . 7 . 4 .';
const LOBBY_HARMONY_PHRASE = [
  riff(PLUCK_MAJ7, 'Bb3'),
  riff(PLUCK_MAJ, 'C4'),
  riff(PLUCK_MIN7, 'A3'),
  riff(PLUCK_MIN7, 'D4'),
  riff(PLUCK_MIN7, 'G3'),
  riff(PLUCK_DOM7, 'C4'),
  riff(PLUCK_MAJ7, 'F3'),
];
const LOBBY_HARMONY = [
  ...LOBBY_HARMONY_PHRASE,
  `${riff('0 . 3 . 7 . 10 .', 'G3')} ${riff('0 . 4 . 7 . 10 .', 'C4')}`,
  ...LOBBY_HARMONY_PHRASE.slice(0, 6),
  riff(PLUCK_MAJ, 'F3'), // no maj7 here: the lead holds F5
  `${riff('0 . 4 . 7 . 12 .', 'F3')} ${riff('0 . 4 . 7 . 10 .', 'F3')}`,
];

const BACKBEAT = '....x.......x...';

const LOBBY: SongSource = {
  bpm: 110,
  swing: 0.12,
  echo: 0.22,
  leadWave: 'square',
  harmonyWave: 'pulse25',
  lead: LOBBY_LEAD,
  harmony: LOBBY_HARMONY,
  bass: LOBBY_BASS,
  kick: repeat(16, 'x......x..x.....'),
  snare: [...repeat(7, BACKBEAT), '....x.......x.xx', ...repeat(7, BACKBEAT), '....x.....x.xxxx'],
  hat: repeat(16, 'x.x.x.xxx.x.x.o.'),
};

// ---------------------------------------------------------------------------------------------
// Race: driving A-minor loop for open questions. Choppy 3-3-2 riff (A), then a soaring line (B).
// Chords: Am F G E | Am F Dm E | F G Am Am | Dm E F E7

const RACE_LEAD = [
  'A5  -   .   A5  .   C6  -   .   B5  -   .   A5  -   -   E5  -', // Am
  '-   -   .   .   F5  .   A5  .   C6  -   B5  -   A5  -   G5  -', // F
  'G5  -   .   G5  .   B5  -   .   A5  -   .   G5  -   -   D5  -', // G
  '-   -   .   .   E5  .   G#5 .   B5  -   D6  -   -   -   C6  B5', // E
  'A5  -   .   A5  .   C6  -   .   E6  -   .   D6  -   -   C6  -', // Am
  '-   -   .   .   A5  .   C6  .   D6  -   C6  -   A5  -   F5  -', // F
  'D5  -   .   D5  .   F5  -   .   A5  -   .   D6  -   -   C6  -', // Dm
  '-   -   B5  -   G#5 -   E5  -   G#5 -   B5  -   D6  -   E6  -', // E
  'A5  -   -   -   -   -   C6  -   -   -   -   -   F5  -   G5  -', // F
  'A5  -   -   -   -   -   B5  -   -   -   -   -   D6  -   -   -', // G
  'E6  -   -   -   -   -   D6  -   -   -   C6  -   -   -   B5  -', // Am
  'C6  -   -   -   A5  -   -   -   .   .   E5  -   A5  -   C6  -', // Am
  'D6  -   -   -   -   -   C6  -   -   -   A5  -   -   -   F5  -', // Dm
  'E5  -   -   -   G#5 -   -   -   B5  -   -   -   E6  -   -   -', // E
  'C6  -   -   -   -   -   A5  -   -   -   F5  -   -   -   A5  -', // F
  'G#5 -   -   -   B5  -   -   -   D6  -   -   -   E6  -   D6  B5', // E7
];

const PUMP = '0 . 12 . 0 . 12 . 0 . 12 . 0 . 12 .';
const GALLOP = '0 . 0 12 0 . 0 12 0 . 0 12 0 . 0 12';
const RACE_BASS = [
  ...['A2', 'F2', 'G2', 'E2', 'A2', 'F2', 'D3', 'E2'].map((root) => riff(PUMP, root)),
  ...['F2', 'G2', 'A2', 'A2', 'D3', 'E2', 'F2', 'E2'].map((root) => riff(GALLOP, root)),
];

const RUN_MIN = '0 3 7 12 0 3 7 12 0 3 7 12 0 3 7 12';
const RUN_MAJ = '0 4 7 12 0 4 7 12 0 4 7 12 0 4 7 12';
const RUN_DOM7 = '0 4 7 10 0 4 7 10 0 4 7 10 0 4 7 10';
const RACE_HARMONY = [
  riff(RUN_MIN, 'A3'),
  riff(RUN_MAJ, 'F3'),
  riff(RUN_MAJ, 'G3'),
  riff(RUN_MAJ, 'E3'),
  riff(RUN_MIN, 'A3'),
  riff(RUN_MAJ, 'F3'),
  riff(RUN_MIN, 'D4'),
  riff(RUN_DOM7, 'E3'),
  riff(RUN_MAJ, 'F3'),
  riff(RUN_MAJ, 'G3'),
  riff(RUN_MIN, 'A3'),
  riff(RUN_MIN, 'A3'),
  riff(RUN_MIN, 'D4'),
  riff(RUN_MAJ, 'E3'),
  riff(RUN_MAJ, 'F3'),
  riff(RUN_DOM7, 'E3'),
];

const RACE: SongSource = {
  bpm: 150,
  echo: 0.12,
  leadWave: 'square',
  harmonyWave: 'pulse12',
  lead: RACE_LEAD,
  harmony: RACE_HARMONY,
  bass: RACE_BASS,
  kick: repeat(16, 'x...x...x...x...'),
  snare: [...repeat(7, BACKBEAT), '....x.......xxxx', ...repeat(7, BACKBEAT), '....x...x.x.xxxx'],
  hat: [...repeat(8, 'x.X.x.X.x.X.x.X.'), ...repeat(8, 'xxXxxxXxxxXxxxXx')],
};

// ---------------------------------------------------------------------------------------------
// Results: triumphant C-major march for the scoreboard and podium, ending on a bVI-bVII-I lift.
// Chords: C F G C | Am F D7 G | C F G Em | F G Ab-Bb C

const RESULTS_LEAD_OPENING = [
  'E5  -   -   G5  C6  -   -   -   G5  -   C6  -   D6  -   -   -', // C
  'C6  -   -   -   A5  -   -   -   F5  -   A5  -   C6  -   -   -', // F
  'B5  -   -   -   G5  -   -   -   D5  -   G5  -   B5  -   -   -', // G
];

const RESULTS_LEAD = [
  ...RESULTS_LEAD_OPENING,
  'C6  -   -   -   -   -   -   -   G5  -   -   -   E5  -   G5  -', // C
  'A5  -   -   C6  E6  -   -   -   D6  -   C6  -   B5  -   -   -', // Am
  'A5  -   -   -   -   -   -   -   F5  -   G5  -   A5  -   C6  -', // F
  'D6  -   -   -   C6  -   -   -   A5  -   -   -   F#5 -   -   -', // D7
  'G5  -   -   -   -   -   -   -   .   .   B4  -   C5  -   D5  -', // G
  ...RESULTS_LEAD_OPENING,
  'G5  -   -   -   E5  -   -   -   B4  -   E5  -   G5  -   -   -', // Em
  'F5  -   -   A5  C6  -   -   -   D6  -   C6  -   A5  -   -   -', // F
  'G5  -   -   B5  D6  -   -   -   E6  -   D6  -   B5  -   -   -', // G
  'C6  -   -   -   Eb6 -   -   -   D6  -   -   -   Bb5 -   D6  -', // Ab | Bb
  'E6  -   -   -   -   -   -   -   -   -   -   -   .   .   .   .', // C
];

const MARCH = '0 - - . 7 - - . 12 - - . 7 - - .';
const MARCH_HALF = '0 - - . 7 - - .';
const RESULTS_BASS = [
  ...['C3', 'F2', 'G2', 'C3', 'A2', 'F2', 'D3', 'G2', 'C3', 'F2', 'G2', 'E2', 'F2', 'G2'].map((root) =>
    riff(MARCH, root),
  ),
  `${riff(MARCH_HALF, 'Ab2')} ${riff(MARCH_HALF, 'Bb2')}`,
  riff(MARCH, 'C3'),
];

const STAB_MAJ = '. . 4 - . . 7 - . . 4 - . . 7 -';
const STAB_MIN = '. . 3 - . . 7 - . . 3 - . . 7 -';
const STAB_DOM7 = '. . 4 - . . 10 - . . 4 - . . 10 -';
const STAB_MAJ_HALF = '. . 4 - . . 7 -';
const RESULTS_HARMONY = [
  riff(STAB_MAJ, 'C4'),
  riff(STAB_MAJ, 'F4'),
  riff(STAB_MAJ, 'G4'),
  riff(STAB_MAJ, 'C4'),
  riff(STAB_MIN, 'A3'),
  riff(STAB_MAJ, 'F4'),
  riff(STAB_DOM7, 'D4'),
  riff(STAB_MAJ, 'G4'),
  riff(STAB_MAJ, 'C4'),
  riff(STAB_MAJ, 'F4'),
  riff(STAB_MAJ, 'G4'),
  riff(STAB_MIN, 'E4'),
  riff(STAB_MAJ, 'F4'),
  riff(STAB_MAJ, 'G4'),
  `${riff(STAB_MAJ_HALF, 'Ab3')} ${riff(STAB_MAJ_HALF, 'Bb3')}`,
  riff(STAB_MAJ, 'C4'),
];

const MARCH_HATS = 'x.x.x.x.x.x.x.x.';
const CRASH_HATS = 'o.x.x.x.x.x.x.x.';

const RESULTS: SongSource = {
  bpm: 118,
  echo: 0.18,
  leadWave: 'square',
  harmonyWave: 'pulse25',
  lead: RESULTS_LEAD,
  harmony: RESULTS_HARMONY,
  bass: RESULTS_BASS,
  kick: repeat(16, 'x.......x.....x.'),
  snare: [...repeat(7, BACKBEAT), '....x.......x.xx', ...repeat(7, BACKBEAT), '....x...x.x.xxxx'],
  hat: [CRASH_HATS, ...repeat(7, MARCH_HATS), CRASH_HATS, ...repeat(7, MARCH_HATS)],
};

// ---------------------------------------------------------------------------------------------
// Fanfare: a two-second, one-shot victory jingle (24 steps at 180 BPM) climbing to a held C6.

const FANFARE_SOURCE: SongSource = {
  bpm: 180,
  leadWave: 'square',
  harmonyWave: 'pulse25',
  lead: ['E5 F5 G5 .  G5 .  A5 -  -  B5 -  -  C6 -  -  -  -  -  -  -  -  -  -  .'],
  harmony: ['C5 D5 E5 .  E5 .  F5 -  -  G5 -  -  E5 -  -  -  -  -  -  -  -  -  -  .'],
  bass: ['C3 -  -  .  C3 .  F2 -  -  G2 -  -  C3 -  -  -  -  -  -  -  -  -  -  .'],
  kick: ['x...x.x..x..x...........'],
  snare: ['.........xxxx...........'],
  hat: ['............o...........'],
};

export const SONG_SOURCES: Readonly<Record<SongName | 'fanfare', SongSource>> = {
  lobby: LOBBY,
  race: RACE,
  results: RESULTS,
  fanfare: FANFARE_SOURCE,
};

export function compileSong(source: SongSource): Song {
  const steps: NoteEvent[][] = [];
  const add = (step: number, event: NoteEvent) => {
    (steps[step] ??= []).push(event);
  };
  let length = 0;

  const melodic = [
    ['lead', source.lead],
    ['harmony', source.harmony ?? []],
    ['bass', source.bass],
  ] as const;
  for (const [instrument, bars] of melodic) {
    const tokens = splitTokens(bars.join(' '));
    let held: NoteEvent | null = null;
    for (const [step, token] of tokens.entries()) {
      if (token === '-') {
        if (held) held.length += 1;
        continue;
      }
      const midi = token === '.' ? null : noteToMidi(token);
      held = midi === null ? null : { instrument, midi, length: 1, accent: false };
      if (held) add(step, held);
    }
    length = Math.max(length, tokens.length);
  }

  const drums = [
    ['kick', source.kick],
    ['snare', source.snare],
    ['hat', source.hat],
  ] as const;
  for (const [instrument, bars] of drums) {
    const hits = [...bars.join('').replace(/[\s|]/g, '')];
    for (const [step, hit] of hits.entries()) {
      if (hit === 'x' || hit === 'X') add(step, { instrument, midi: 0, length: 1, accent: hit === 'X' });
      else if (hit === 'o') add(step, { instrument: 'openHat', midi: 0, length: 1, accent: false });
    }
    length = Math.max(length, hits.length);
  }

  return {
    bpm: source.bpm,
    swing: source.swing ?? 0,
    echo: source.echo ?? 0,
    leadWave: source.leadWave ?? 'square',
    harmonyWave: source.harmonyWave ?? 'pulse25',
    length,
    steps: Array.from({ length }, (_, step) => steps[step] ?? []),
  };
}

export const SONGS: Readonly<Record<SongName, Song>> = {
  lobby: compileSong(LOBBY),
  race: compileSong(RACE),
  results: compileSong(RESULTS),
};

export const FANFARE: Song = compileSong(FANFARE_SOURCE);
