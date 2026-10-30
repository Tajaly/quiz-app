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
  { label: 'A', icon: 'cone', className: 'bg-[#d62839] text-white', barColor: '#d62839' },
  { label: 'B', icon: 'tire', className: 'bg-[#1d6fd1] text-white', barColor: '#1d6fd1' },
  { label: 'C', icon: 'bolt', className: 'bg-sun text-ink', barColor: '#ffc93c' },
  { label: 'D', icon: 'flag', className: 'bg-[#2d8a3e] text-white', barColor: '#2d8a3e' },
];

export function answerStyle(index: number): AnswerStyle {
  return ANSWER_STYLES[index % ANSWER_STYLES.length] ?? ANSWER_STYLES[0]!;
}
