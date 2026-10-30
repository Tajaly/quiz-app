import { describe, expect, it } from 'vitest';
import type { McQuestion } from '@power-quiz/shared';
import {
  changeQuestionType,
  duplicateQuestion,
  emptyDraft,
  moveItem,
  newMcQuestion,
  prepareForSave,
  validateDraft,
} from './editorModel';

function filledMc(texts: string[], correct = 0): McQuestion {
  const question = newMcQuestion();
  const options = question.options.map((option, index) => ({ ...option, text: texts[index] ?? '' }));
  return { ...question, text: 'Capital of France?', options, correctOptionId: options[correct]!.id };
}

describe('editor model', () => {
  it('starts with one empty multiple-choice question with four answer slots', () => {
    const draft = emptyDraft();
    expect(draft.questions).toHaveLength(1);
    const [question] = draft.questions;
    expect(question?.type === 'mc' && question.options).toHaveLength(4);
  });

  it('drops unused answer slots before saving', () => {
    const question = filledMc(['Paris', 'Rome', '', '']);
    const prepared = prepareForSave({ title: ' Quiz ', description: '', questions: [question] });
    expect(prepared.title).toBe('Quiz');
    const [saved] = prepared.questions;
    expect(saved?.type === 'mc' && saved.options.map((o) => o.text)).toEqual(['Paris', 'Rome']);
  });

  it('keeps an empty slot if it is marked correct so the error is visible there', () => {
    const question = filledMc(['Paris', 'Rome', '', ''], 2);
    const { data, errors } = validateDraft({ title: 'Quiz', description: '', questions: [question] });
    expect(data).toBeNull();
    expect(errors[`option:${question.options[2]!.id}`]).toBe('Answer option is required');
  });

  it('reports errors keyed by stable ids', () => {
    const question = filledMc(['Paris', '', '', '']);
    const { data, errors } = validateDraft({
      title: '',
      description: '',
      questions: [{ ...question, text: '' }],
    });
    expect(data).toBeNull();
    expect(errors.title).toBe('Title is required');
    expect(errors[`question:${question.id}:text`]).toBe('Question is required');
    expect(errors[`option:${question.options[1]!.id}`]).toBe('Answer option is required');
  });

  it('returns clean data when the draft is valid', () => {
    const question = filledMc(['Paris', 'Rome', 'Berlin', '']);
    const { data, errors } = validateDraft({ title: 'Quiz', description: 'Fun', questions: [question] });
    expect(errors).toEqual({});
    expect(data?.questions[0]).toMatchObject({ type: 'mc', correctOptionId: question.options[0]!.id });
  });

  it('switches question types while keeping the text and time limit', () => {
    const question = { ...filledMc(['Paris', 'Rome']), timeLimitSec: 45 };
    const open = changeQuestionType(question, 'open');
    expect(open).toEqual({ id: question.id, type: 'open', text: 'Capital of France?', timeLimitSec: 45 });
    const back = changeQuestionType(open, 'mc');
    expect(back.type === 'mc' && back.options).toHaveLength(4);
    expect(back.timeLimitSec).toBe(45);
  });

  it('duplicates questions with fresh ids and the same correct answer', () => {
    const question = filledMc(['Paris', 'Rome'], 1);
    const copy = duplicateQuestion(question) as McQuestion;
    expect(copy.id).not.toBe(question.id);
    expect(copy.options[1]?.text).toBe('Rome');
    expect(copy.correctOptionId).toBe(copy.options[1]?.id);
    expect(copy.options.map((o) => o.id)).not.toContain(question.options[0]!.id);
  });

  it('moves items within bounds', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, 3)).toEqual(['a', 'b', 'c']);
  });
});
