import { z } from 'zod';
import { KART_COLORS, KART_MODELS } from './karts';
import { LIMITS, PIN_LENGTH } from './limits';

export const idSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'Invalid id');

export const kartSchema = z.object({
  model: z.enum(KART_MODELS),
  color: z.enum(KART_COLORS),
});

/** Collapses whitespace and normalises look-alike characters so nicknames compare predictably. */
export function normalizeNickname(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

/** Case-insensitive key used to keep nicknames unique within a session. */
export function nicknameKey(value: string): string {
  return normalizeNickname(value).toLocaleLowerCase('en');
}

export const nicknameSchema = z
  .string()
  .transform(normalizeNickname)
  .pipe(
    z
      .string()
      .min(1, 'Enter a nickname')
      .max(LIMITS.nicknameMax, `Use at most ${LIMITS.nicknameMax} characters`)
      .regex(/^[\p{L}\p{N}][\p{L}\p{N} ._!?'-]*$/u, "Use letters, numbers, spaces and . _ ! ? ' -"),
  );

export const pinSchema = z
  .string()
  .trim()
  .regex(new RegExp(`^\\d{${PIN_LENGTH}}$`), `The PIN has ${PIN_LENGTH} digits`);

const requiredText = (max: number, label: string) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`);

export const timeLimitSchema = z
  .number()
  .int()
  .min(LIMITS.timeLimitMinSec, `Use at least ${LIMITS.timeLimitMinSec} seconds`)
  .max(LIMITS.timeLimitMaxSec, `Use at most ${LIMITS.timeLimitMaxSec} seconds`);

export const mcOptionSchema = z.object({
  id: idSchema,
  text: requiredText(LIMITS.optionTextMax, 'Answer option'),
});

export const mcQuestionSchema = z.object({
  id: idSchema,
  type: z.literal('mc'),
  text: requiredText(LIMITS.questionTextMax, 'Question'),
  options: z
    .array(mcOptionSchema)
    .min(LIMITS.optionsMin, `Add at least ${LIMITS.optionsMin} answer options`)
    .max(LIMITS.optionsMax, `Use at most ${LIMITS.optionsMax} answer options`),
  correctOptionId: idSchema,
  timeLimitSec: timeLimitSchema,
});

export const openQuestionSchema = z.object({
  id: idSchema,
  type: z.literal('open'),
  text: requiredText(LIMITS.questionTextMax, 'Question'),
  timeLimitSec: timeLimitSchema,
});

export const questionSchema = z.discriminatedUnion('type', [mcQuestionSchema, openQuestionSchema]);

export const quizInputSchema = z
  .object({
    title: requiredText(LIMITS.quizTitleMax, 'Title'),
    description: z
      .string()
      .trim()
      .max(LIMITS.quizDescriptionMax, `Description must be at most ${LIMITS.quizDescriptionMax} characters`)
      .default(''),
    questions: z
      .array(questionSchema)
      .max(LIMITS.questionsPerQuizMax, `Use at most ${LIMITS.questionsPerQuizMax} questions`),
  })
  .superRefine((quiz, ctx) => {
    const questionIds = new Set<string>();
    quiz.questions.forEach((question, index) => {
      if (questionIds.has(question.id)) {
        ctx.addIssue({ code: 'custom', message: 'Duplicate question id', path: ['questions', index, 'id'] });
      }
      questionIds.add(question.id);
      if (question.type !== 'mc') return;
      const optionIds = new Set(question.options.map((option) => option.id));
      if (optionIds.size !== question.options.length) {
        ctx.addIssue({
          code: 'custom',
          message: 'Duplicate answer option id',
          path: ['questions', index, 'options'],
        });
      }
      if (!optionIds.has(question.correctOptionId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Mark the correct answer',
          path: ['questions', index, 'correctOptionId'],
        });
      }
    });
  });

export const openAnswerSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, ' ').trim())
  .pipe(
    z
      .string()
      .min(1, 'Type an answer')
      .max(LIMITS.openAnswerMax, `Use at most ${LIMITS.openAnswerMax} characters`),
  );

// ---- Socket payloads -------------------------------------------------------

export const joinPayloadSchema = z.object({
  pin: pinSchema,
  nickname: nicknameSchema,
  kart: kartSchema,
});

export const rejoinPayloadSchema = z.object({
  sessionId: idSchema,
  playerToken: z.string().min(16).max(128),
});

export const answerPayloadSchema = z
  .object({
    questionIndex: z.number().int().min(0),
    optionId: idSchema.optional(),
    text: z.string().max(500).optional(),
  })
  .refine((payload) => (payload.optionId === undefined) !== (payload.text === undefined), {
    message: 'Send either an option or a text answer',
  });

export const hostAttachSchema = z.object({ sessionId: idSchema });
export const setLockedSchema = z.object({ locked: z.boolean() });
export const kickSchema = z.object({ playerId: idSchema });
export const hideAnswerSchema = z.object({
  questionIndex: z.number().int().min(0),
  playerId: idSchema,
  hidden: z.boolean(),
});

// ---- REST payloads -----------------------------------------------------------

export const startSessionSchema = z.object({ quizId: idSchema });
