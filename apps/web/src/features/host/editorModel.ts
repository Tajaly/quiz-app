import {
  DEFAULT_TIME_LIMIT_SEC,
  LIMITS,
  quizInputSchema,
  type McOption,
  type McQuestion,
  type OpenQuestion,
  type Question,
  type Quiz,
  type QuizInput,
} from '@power-quiz/shared';
import { createId } from '../../lib/format';

/** Validation messages keyed by stable ids (e.g. `question:<id>:text`, `option:<id>`). */
export type DraftErrors = Record<string, string>;

export function newOption(text = ''): McOption {
  return { id: createId(), text };
}

export function newMcQuestion(timeLimitSec = DEFAULT_TIME_LIMIT_SEC): McQuestion {
  const options = Array.from({ length: LIMITS.optionsMax }, () => newOption());
  return { id: createId(), type: 'mc', text: '', options, correctOptionId: options[0]!.id, timeLimitSec };
}

export function newOpenQuestion(timeLimitSec = 30): OpenQuestion {
  return { id: createId(), type: 'open', text: '', timeLimitSec };
}

export function emptyDraft(): QuizInput {
  return { title: '', description: '', questions: [newMcQuestion()] };
}

export function toDraft(quiz: Quiz): QuizInput {
  return { title: quiz.title, description: quiz.description, questions: structuredClone(quiz.questions) };
}

export function changeQuestionType(question: Question, type: Question['type']): Question {
  if (question.type === type) return question;
  if (type === 'open')
    return { id: question.id, type: 'open', text: question.text, timeLimitSec: question.timeLimitSec };
  const fresh = newMcQuestion(question.timeLimitSec);
  return { ...fresh, id: question.id, text: question.text };
}

export function duplicateQuestion(question: Question): Question {
  if (question.type === 'open') return { ...question, id: createId() };
  const options = question.options.map((option) => ({ ...option, id: createId() }));
  const correctIndex = question.options.findIndex((option) => option.id === question.correctOptionId);
  return { ...question, id: createId(), options, correctOptionId: options[Math.max(0, correctIndex)]!.id };
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return [...items];
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

/** Trims text and drops unused (empty) answer slots, keeping enough for helpful errors. */
export function prepareForSave(draft: QuizInput): QuizInput {
  return {
    title: draft.title.trim(),
    description: draft.description.trim(),
    questions: draft.questions.map((question) => {
      if (question.type === 'open') return { ...question, text: question.text.trim() };
      const trimmed = question.options.map((option) => ({ ...option, text: option.text.trim() }));
      const used = trimmed.filter(
        (option) => option.text.length > 0 || option.id === question.correctOptionId,
      );
      return {
        ...question,
        text: question.text.trim(),
        options:
          used.length >= LIMITS.optionsMin
            ? used
            : trimmed.slice(0, Math.max(LIMITS.optionsMin, used.length)),
      };
    }),
  };
}

function errorKey(quiz: QuizInput, path: readonly PropertyKey[]): string {
  const [root, questionIndex, field, optionIndex] = path;
  if (root !== 'questions' || typeof questionIndex !== 'number') return String(root ?? 'form');
  const question = quiz.questions[questionIndex];
  if (!question) return 'questions';
  if (field === 'options' && typeof optionIndex === 'number' && question.type === 'mc') {
    const option = question.options[optionIndex];
    if (option) return `option:${option.id}`;
  }
  return `question:${question.id}:${String(field ?? 'text')}`;
}

export function validateDraft(draft: QuizInput): { data: QuizInput | null; errors: DraftErrors } {
  const cleaned = prepareForSave(draft);
  const result = quizInputSchema.safeParse(cleaned);
  if (result.success) return { data: result.data, errors: {} };
  const errors: DraftErrors = {};
  for (const issue of result.error.issues) {
    const key = errorKey(cleaned, issue.path);
    errors[key] ??= issue.message;
  }
  return { data: null, errors };
}
