import type { IconName } from './sprites/icons';

export interface AnswerStyle {
  label: string;
  icon: IconName;
  /** Tailwind classes for background + readable text colour. */
  className: string;
  barColor: string;
}

/** Colour + shape + letter per answer slot, so options never rely on colour alone. */
export const ANSWER_STYLES: readonly AnswerStyle[] = [
  { label: 'A', icon: 'cone', className: 'bg-answer-a text-answer-a-ink', barColor: '#f4a89e' },
  { label: 'B', icon: 'tire', className: 'bg-answer-b text-answer-b-ink', barColor: '#91bfe8' },
  { label: 'C', icon: 'bolt', className: 'bg-sun-soft text-answer-c-ink', barColor: '#f4ce60' },
  { label: 'D', icon: 'flag', className: 'bg-lime-soft text-answer-d-ink', barColor: '#a6d58d' },
];

export function answerStyle(index: number): AnswerStyle {
  return ANSWER_STYLES[index % ANSWER_STYLES.length] ?? ANSWER_STYLES[0]!;
}
