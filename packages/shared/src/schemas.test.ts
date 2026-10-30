import { describe, expect, it } from 'vitest';
import {
  answerPayloadSchema,
  joinPayloadSchema,
  nicknameKey,
  nicknameSchema,
  openAnswerSchema,
  pinSchema,
  quizInputSchema,
} from './schemas';

const mcQuestion = {
  id: 'q1',
  type: 'mc' as const,
  text: 'Which planet is the largest?',
  options: [
    { id: 'a', text: 'Mars' },
    { id: 'b', text: 'Jupiter' },
  ],
  correctOptionId: 'b',
  timeLimitSec: 20,
};

describe('quizInputSchema', () => {
  it('accepts a valid quiz with multiple-choice and open questions', () => {
    const result = quizInputSchema.safeParse({
      title: '  Space quiz  ',
      questions: [mcQuestion, { id: 'q2', type: 'open', text: 'Favourite star?', timeLimitSec: 30 }],
    });
    expect(result.success).toBe(true);
    expect(result.data?.title).toBe('Space quiz');
    expect(result.data?.description).toBe('');
  });

  it('requires the correct answer to be one of the options', () => {
    const result = quizInputSchema.safeParse({
      title: 'Quiz',
      questions: [{ ...mcQuestion, correctOptionId: 'z' }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['questions', 0, 'correctOptionId']);
  });

  it('limits multiple-choice questions to 2-4 options', () => {
    const one = quizInputSchema.safeParse({
      title: 'Quiz',
      questions: [{ ...mcQuestion, options: [{ id: 'b', text: 'Jupiter' }] }],
    });
    const five = quizInputSchema.safeParse({
      title: 'Quiz',
      questions: [
        {
          ...mcQuestion,
          options: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, text: id.toUpperCase() })),
        },
      ],
    });
    expect(one.success).toBe(false);
    expect(five.success).toBe(false);
  });

  it('rejects duplicate question ids and option ids', () => {
    const result = quizInputSchema.safeParse({
      title: 'Quiz',
      questions: [mcQuestion, { ...mcQuestion, options: [mcQuestion.options[0], mcQuestion.options[0]] }],
    });
    expect(result.success).toBe(false);
    const messages = result.error?.issues.map((issue) => issue.message);
    expect(messages).toContain('Duplicate question id');
    expect(messages).toContain('Duplicate answer option id');
  });

  it('enforces time limits', () => {
    expect(
      quizInputSchema.safeParse({ title: 'Q', questions: [{ ...mcQuestion, timeLimitSec: 2 }] }).success,
    ).toBe(false);
    expect(
      quizInputSchema.safeParse({ title: 'Q', questions: [{ ...mcQuestion, timeLimitSec: 121 }] }).success,
    ).toBe(false);
  });
});

describe('nicknames', () => {
  it('normalises whitespace', () => {
    expect(nicknameSchema.parse('  Speedy   Gonzo ')).toBe('Speedy Gonzo');
  });

  it('accepts international letters', () => {
    expect(nicknameSchema.safeParse('Jürgen Müller').success).toBe(true);
  });

  it('rejects empty, too long and symbol-only names', () => {
    expect(nicknameSchema.safeParse('   ').success).toBe(false);
    expect(nicknameSchema.safeParse('x'.repeat(21)).success).toBe(false);
    expect(nicknameSchema.safeParse('<script>').success).toBe(false);
    expect(nicknameSchema.safeParse('!!!').success).toBe(false);
  });

  it('builds case-insensitive keys', () => {
    expect(nicknameKey(' Turbo  Tom ')).toBe(nicknameKey('turbo tom'));
  });
});

describe('payloads', () => {
  it('validates PINs', () => {
    expect(pinSchema.safeParse('123456').success).toBe(true);
    expect(pinSchema.safeParse('12345').success).toBe(false);
    expect(pinSchema.safeParse('12a456').success).toBe(false);
  });

  it('validates join payloads', () => {
    expect(
      joinPayloadSchema.safeParse({
        pin: '123456',
        nickname: 'Max',
        kart: { model: 'rocket', color: 'cyan' },
      }).success,
    ).toBe(true);
    expect(
      joinPayloadSchema.safeParse({ pin: '123456', nickname: 'Max', kart: { model: 'ufo', color: 'cyan' } })
        .success,
    ).toBe(false);
  });

  it('requires exactly one of option or text in answers', () => {
    expect(answerPayloadSchema.safeParse({ questionIndex: 0, optionId: 'a' }).success).toBe(true);
    expect(answerPayloadSchema.safeParse({ questionIndex: 0, text: 'hi' }).success).toBe(true);
    expect(answerPayloadSchema.safeParse({ questionIndex: 0 }).success).toBe(false);
    expect(answerPayloadSchema.safeParse({ questionIndex: 0, optionId: 'a', text: 'hi' }).success).toBe(
      false,
    );
  });

  it('normalises open answers and enforces their length', () => {
    expect(openAnswerSchema.parse('  big   red  ')).toBe('big red');
    expect(openAnswerSchema.safeParse('   ').success).toBe(false);
    expect(openAnswerSchema.safeParse('x'.repeat(81)).success).toBe(false);
  });
});
