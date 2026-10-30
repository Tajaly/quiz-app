import type { QuestionAnswersRecord, Quiz, SessionRecord } from '@power-quiz/shared';
import type { AppConfig } from '../src/config';
import type { ResultsSink } from '../src/game/LiveSession';

export function makeQuiz(overrides: Partial<Quiz> = {}): Quiz {
  return {
    id: 'quiz-1',
    ownerId: 'dev-alice',
    title: 'Grand Prix',
    description: 'Warm-up laps',
    questions: [
      {
        id: 'q1',
        type: 'mc',
        text: 'Capital of France?',
        options: [
          { id: 'a', text: 'Paris' },
          { id: 'b', text: 'Rome' },
          { id: 'c', text: 'Berlin' },
        ],
        correctOptionId: 'a',
        timeLimitSec: 20,
      },
      {
        id: 'q2',
        type: 'mc',
        text: 'What is 2 + 2?',
        options: [
          { id: 'a', text: '3' },
          { id: 'b', text: '4' },
        ],
        correctOptionId: 'b',
        timeLimitSec: 10,
      },
      { id: 'q3', type: 'open', text: 'Favourite colour?', timeLimitSec: 15 },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export class RecordingSink implements ResultsSink {
  readonly sessions: SessionRecord[] = [];
  readonly answers: QuestionAnswersRecord[] = [];

  async saveSession(record: SessionRecord): Promise<void> {
    this.sessions.push(structuredClone(record));
  }

  async saveQuestionAnswers(record: QuestionAnswersRecord): Promise<void> {
    this.answers.push(structuredClone(record));
  }
}

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    env: 'test',
    port: 0,
    logLevel: 'silent',
    auth: { mode: 'dev' },
    cosmos: null,
    resultTtlSeconds: 90 * 24 * 60 * 60,
    staticDir: null,
    trustProxy: 0,
    ...overrides,
  };
}

export const devAuthHeader = (name: string) => ({ Authorization: `Bearer dev:${encodeURIComponent(name)}` });
