import { describe, expect, it } from 'vitest';
import { FANFARE, SONG_SOURCES, SONGS, splitTokens, type SongName, type SongSource } from './music';
import { stepDuration } from './sequencer';
import { midiToFreq, midiToNote, noteToMidi } from './synth';

const LOOPS: SongName[] = ['lobby', 'race', 'results'];

function melodicParts(source: SongSource): Record<string, readonly string[]> {
  return { lead: source.lead, harmony: source.harmony ?? [], bass: source.bass };
}

function drumLanes(source: SongSource): Record<string, readonly string[]> {
  return { kick: source.kick, snare: source.snare, hat: source.hat };
}

function loopSeconds(name: SongName): number {
  const song = SONGS[name];
  return song.length * stepDuration(song);
}

describe('note helpers', () => {
  it('converts between note names, MIDI numbers and frequencies', () => {
    expect(noteToMidi('A4')).toBe(69);
    expect(noteToMidi('C4')).toBe(60);
    expect(noteToMidi('Bb3')).toBe(58);
    expect(noteToMidi('F#5')).toBe(78);
    expect(noteToMidi('H2')).toBeNull();
    expect(noteToMidi('-')).toBeNull();
    expect(midiToNote(70)).toBe('A#4');
    expect(noteToMidi(midiToNote(43))).toBe(43);
    expect(midiToFreq(69)).toBe(440);
    expect(midiToFreq(81)).toBeCloseTo(880);
  });
});

describe.each(LOOPS)('%s loop', (name) => {
  const source = SONG_SOURCES[name];

  it('has 16 bars of 16 steps in every part', () => {
    for (const [part, bars] of Object.entries(melodicParts(source))) {
      expect(bars, part).toHaveLength(16);
      bars.forEach((bar, i) => expect(splitTokens(bar), `${part} bar ${i + 1}`).toHaveLength(16));
    }
    for (const [lane, bars] of Object.entries(drumLanes(source))) {
      expect(bars, lane).toHaveLength(16);
      bars.forEach((bar, i) => expect(bar.replace(/\s/g, ''), `${lane} bar ${i + 1}`).toHaveLength(16));
    }
  });

  it('only uses valid tokens', () => {
    for (const bars of Object.values(melodicParts(source))) {
      for (const token of splitTokens(bars.join(' '))) {
        expect(token === '-' || token === '.' || noteToMidi(token) !== null, token).toBe(true);
      }
    }
    for (const bars of Object.values(drumLanes(source))) {
      for (const bar of bars) expect(bar).toMatch(/^[xXo.\s]+$/);
    }
  });

  it('compiles to a 256-step loop using every instrument', () => {
    const song = SONGS[name];
    expect(song.length).toBe(256);
    const instruments = new Set(song.steps.flat().map((event) => event.instrument));
    for (const instrument of ['lead', 'harmony', 'bass', 'kick', 'snare', 'hat'] as const) {
      expect(instruments).toContain(instrument);
    }
  });

  it('keeps the lead in a comfortable register', () => {
    const leadNotes = SONGS[name].steps.flat().filter((event) => event.instrument === 'lead');
    for (const note of leadNotes) {
      expect(note.midi).toBeGreaterThanOrEqual(noteToMidi('G4') ?? 0);
      expect(note.midi).toBeLessThanOrEqual(noteToMidi('E6') ?? 0);
    }
  });
});

describe('songs', () => {
  it('use the intended tempos and loop lengths', () => {
    expect(SONGS.lobby.bpm).toBe(110);
    expect(SONGS.race.bpm).toBe(150);
    expect(SONGS.results.bpm).toBe(118);
    expect(loopSeconds('lobby')).toBeCloseTo(34.9, 1);
    expect(loopSeconds('race')).toBeCloseTo(25.6, 1);
    expect(loopSeconds('results')).toBeCloseTo(32.5, 1);
  });

  it('hold notes across bar lines', () => {
    // Lobby bar 3 ends on A5, tied for two more steps into bar 4.
    const tied = SONGS.lobby.steps[2 * 16 + 14]?.find((event) => event.instrument === 'lead');
    expect(tied).toMatchObject({ midi: noteToMidi('A5'), length: 4 });
  });
});

describe('fanfare', () => {
  it('is a two-second one-shot with aligned parts', () => {
    const source = SONG_SOURCES.fanfare;
    const lengths = [
      ...Object.values(melodicParts(source)).map((bars) => splitTokens(bars.join(' ')).length),
      ...Object.values(drumLanes(source)).map((bars) => bars.join('').replace(/\s/g, '').length),
    ];
    expect(new Set(lengths)).toEqual(new Set([24]));
    expect(FANFARE.length * stepDuration(FANFARE)).toBeCloseTo(2, 1);
  });
});
