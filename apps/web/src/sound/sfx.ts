import type { SfxName } from './audio';
import { FANFARE } from './music';
import { playOnce } from './sequencer';
import { midiToFreq, type Synth } from './synth';

/** `variant` counts previous plays of the same effect, for sounds that subtly change on repeats. */
export type SfxRecipe = (synth: Synth, out: AudioNode, time: number, variant: number) => void;

/** C5 D5 E5 G5 A5: consecutive joins climb a pentatonic scale instead of repeating one blip. */
const JOIN_NOTES = [72, 74, 76, 79, 81];
/** C5 E5 G5 C6 E6 G6. */
const REVEAL_NOTES = [72, 76, 79, 84, 88, 91];
/** A5 C#6 E6: an A-major chime. */
const CORRECT_NOTES = [81, 85, 88];

export const SFX: Readonly<Record<SfxName, SfxRecipe>> = {
  join(synth, out, time, variant) {
    const root = JOIN_NOTES[variant % JOIN_NOTES.length] ?? 72;
    synth.tone(out, { wave: 'pulse25', freq: midiToFreq(root), start: time, duration: 0.05, volume: 0.5 });
    synth.tone(out, {
      wave: 'pulse25',
      freq: midiToFreq(root + 7),
      start: time + 0.065,
      duration: 0.07,
      volume: 0.5,
      release: 0.06,
    });
  },

  countdownTick(synth, out, time) {
    synth.tone(out, { wave: 'square', freq: 440, start: time, duration: 0.22, volume: 0.4, release: 0.03 });
  },

  go(synth, out, time) {
    synth.tone(out, { wave: 'square', freq: 880, start: time, duration: 0.54, volume: 0.4, release: 0.06 });
    synth.tone(out, {
      wave: 'pulse25',
      freq: 1760,
      start: time,
      duration: 0.54,
      volume: 0.09,
      release: 0.06,
    });
  },

  // Fires for every answer in a room, so it stays tiny: a single quiet triangle blip.
  answer(synth, out, time, variant) {
    synth.tone(out, {
      wave: 'triangle',
      freq: variant % 2 === 0 ? 1568 : 1760,
      start: time,
      duration: 0.01,
      volume: 0.25,
      attack: 0.002,
      release: 0.04,
    });
  },

  // Two slightly detuned squares beat against each other while sliding down two octaves.
  timeUp(synth, out, time) {
    for (const detune of [-14, 14]) {
      synth.tone(out, {
        wave: 'square',
        freq: 440,
        slide: { to: 110, time: 0.7 },
        detune,
        start: time,
        duration: 0.6,
        volume: 0.22,
        release: 0.12,
      });
    }
  },

  // One channel stepping through the chord, the classic chiptune way to play an arpeggio.
  reveal(synth, out, time) {
    const step = 0.045;
    const osc = synth.tone(out, {
      wave: 'pulse25',
      freq: midiToFreq(REVEAL_NOTES[0] ?? 72),
      start: time,
      duration: step * REVEAL_NOTES.length + 0.06,
      volume: 0.42,
      release: 0.18,
    });
    REVEAL_NOTES.forEach((note, i) => osc.frequency.setValueAtTime(midiToFreq(note), time + i * step));
  },

  correct(synth, out, time) {
    CORRECT_NOTES.forEach((note, i) => {
      const start = time + i * 0.07;
      const freq = midiToFreq(note);
      synth.tone(out, {
        wave: 'triangle',
        freq,
        start,
        duration: 0.02,
        volume: 0.55,
        attack: 0.002,
        release: 0.5,
      });
      synth.tone(out, {
        wave: 'pulse12',
        freq,
        start,
        duration: 0.02,
        volume: 0.12,
        attack: 0.002,
        release: 0.3,
      });
    });
  },

  // Band-passed noise sweeping up as the kart approaches, then dropping as it passes.
  whoosh(synth, out, time) {
    const filter = synth.noise(out, {
      filter: 'bandpass',
      freq: 300,
      sweep: { to: 3200, time: 0.26 },
      q: 0.9,
      start: time,
      duration: 0.22,
      attack: 0.16,
      volume: 1.7,
      release: 0.3,
    });
    filter.frequency.exponentialRampToValueAtTime(900, time + 0.5);
  },

  overtake(synth, out, time) {
    synth.tone(out, {
      wave: 'pulse25',
      freq: 260,
      slide: { to: 1600, time: 0.12 },
      start: time,
      duration: 0.1,
      volume: 0.4,
      release: 0.06,
    });
  },

  fanfare(synth, out, time) {
    playOnce(synth, out, FANFARE, time, 0.85);
  },

  click(synth, out, time) {
    synth.tone(out, {
      wave: 'square',
      freq: 1500,
      slide: { to: 700, time: 0.025 },
      start: time,
      duration: 0.012,
      volume: 0.2,
      attack: 0.001,
      release: 0.025,
    });
  },
};
