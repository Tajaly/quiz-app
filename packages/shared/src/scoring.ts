import { MAX_POINTS } from './limits';

/**
 * Kahoot-style speed scoring: a correct answer is worth between 50% and 100% of the maximum,
 * decreasing linearly with the time taken. Wrong or missing answers score nothing.
 */
export function calculatePoints(correct: boolean, responseMs: number, timeLimitMs: number): number {
  if (!correct || timeLimitMs <= 0) return 0;
  const elapsed = Math.min(Math.max(responseMs, 0), timeLimitMs);
  return Math.round(MAX_POINTS * (1 - elapsed / timeLimitMs / 2));
}

export interface Rankable {
  id: string;
  score: number;
  correctCount: number;
  /** Sum of response times of correct answers; lower is better. */
  correctTimeMs: number;
  joinOrder: number;
}

/** Tie-breakers: score, then correct answers, then total time on correct answers, then who joined first. */
export function compareRankables(a: Rankable, b: Rankable): number {
  return (
    b.score - a.score ||
    b.correctCount - a.correctCount ||
    a.correctTimeMs - b.correctTimeMs ||
    a.joinOrder - b.joinOrder
  );
}

export function rankPlayers<T extends Rankable>(players: readonly T[]): Array<T & { rank: number }> {
  return [...players].sort(compareRankables).map((player, index) => ({ ...player, rank: index + 1 }));
}
