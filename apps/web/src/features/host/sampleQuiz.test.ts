import { describe, expect, it } from 'vitest';
import { quizInputSchema } from '@power-quiz/shared';
import { sampleQuiz } from './sampleQuiz';

describe('reference sample quiz', () => {
  it('includes the original eight-question warm-up with valid answer keys', () => {
    const quiz = quizInputSchema.parse(sampleQuiz());
    expect(quiz.title).toBe('Pixel Grand Prix warm-up');
    expect(quiz.questions).toHaveLength(8);
    expect(quiz.questions.filter((question) => question.type === 'mc')).toHaveLength(6);
    expect(quiz.questions.filter((question) => question.type === 'open')).toHaveLength(2);
    expect(quiz.questions[0]?.text).toBe('Which planet is known as the Red Planet?');
  });

  it('gives each editable copy its own question and answer IDs', () => {
    const first = sampleQuiz();
    const second = sampleQuiz();
    const firstIds = new Set(
      first.questions.flatMap((question) => [
        question.id,
        ...(question.type === 'mc' ? question.options.map((option) => option.id) : []),
      ]),
    );
    for (const question of second.questions) {
      expect(firstIds.has(question.id)).toBe(false);
      if (question.type === 'mc') {
        for (const option of question.options) expect(firstIds.has(option.id)).toBe(false);
      }
    }
  });
});
