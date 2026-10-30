import { describe, expect, it } from 'vitest';
import { calculatePoints, rankPlayers, type Rankable } from './scoring';

describe('calculatePoints', () => {
  it('awards the maximum for an instant correct answer', () => {
    expect(calculatePoints(true, 0, 20_000)).toBe(1000);
  });

  it('awards half the maximum for a correct answer at the deadline', () => {
    expect(calculatePoints(true, 20_000, 20_000)).toBe(500);
  });

  it('decreases linearly with response time', () => {
    expect(calculatePoints(true, 10_000, 20_000)).toBe(750);
    expect(calculatePoints(true, 5_000, 20_000)).toBe(875);
  });

  it('clamps out-of-range response times', () => {
    expect(calculatePoints(true, -50, 20_000)).toBe(1000);
    expect(calculatePoints(true, 25_000, 20_000)).toBe(500);
  });

  it('awards nothing for wrong answers', () => {
    expect(calculatePoints(false, 0, 20_000)).toBe(0);
  });
});

describe('rankPlayers', () => {
  const player = (id: string, overrides: Partial<Rankable> = {}): Rankable => ({
    id,
    score: 0,
    correctCount: 0,
    correctTimeMs: 0,
    joinOrder: 0,
    ...overrides,
  });

  it('orders by score descending and assigns ranks', () => {
    const ranked = rankPlayers([
      player('a', { score: 500 }),
      player('b', { score: 1500 }),
      player('c', { score: 900 }),
    ]);
    expect(ranked.map((p) => [p.id, p.rank])).toEqual([
      ['b', 1],
      ['c', 2],
      ['a', 3],
    ]);
  });

  it('breaks ties by correct answers, then speed, then join order', () => {
    const ranked = rankPlayers([
      player('slow', { score: 1000, correctCount: 2, correctTimeMs: 9000, joinOrder: 1 }),
      player('fewer', { score: 1000, correctCount: 1, correctTimeMs: 100, joinOrder: 2 }),
      player('fast', { score: 1000, correctCount: 2, correctTimeMs: 3000, joinOrder: 3 }),
      player('late', { score: 1000, correctCount: 2, correctTimeMs: 3000, joinOrder: 4 }),
    ]);
    expect(ranked.map((p) => p.id)).toEqual(['fast', 'late', 'slow', 'fewer']);
  });

  it('does not mutate the input', () => {
    const input = [player('a', { score: 1 }), player('b', { score: 2 })];
    rankPlayers(input);
    expect(input.map((p) => p.id)).toEqual(['a', 'b']);
  });
});
