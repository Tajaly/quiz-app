import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { QuestionAnswersRecord, SessionRecord } from '@power-quiz/shared';
import { createCosmosRepositories } from '../src/repositories/cosmos';
import type { Repositories } from '../src/repositories/types';
import { makeQuiz } from './helpers';

// Runs against a real Cosmos DB API, e.g. the local emulator from docker-compose.yml:
//   COSMOS_TEST_ENDPOINT=http://localhost:8081 npx vitest run --project server test/cosmos.test.ts
const endpoint = process.env.COSMOS_TEST_ENDPOINT;
const EMULATOR_KEY =
  'C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==';

describe.skipIf(!endpoint)('Cosmos DB repositories', () => {
  let repos: Repositories;
  const owner = `owner-${Date.now()}`;

  beforeAll(async () => {
    repos = await createCosmosRepositories({
      endpoint: endpoint ?? '',
      key: process.env.COSMOS_TEST_KEY ?? EMULATOR_KEY,
      database: `powerquiz-test-${Date.now()}`,
      createIfNotExists: true,
    });
  }, 60_000);

  afterAll(async () => {
    // Containers are left in the throwaway database; remove the emulator container to clean up.
  });

  it('stores, lists, updates and deletes quizzes per owner', async () => {
    const quiz = makeQuiz({ id: 'quiz-cosmos-1', ownerId: owner, updatedAt: '2026-01-01T00:00:00.000Z' });
    await repos.quizzes.save(quiz);
    await repos.quizzes.save({
      ...quiz,
      id: 'quiz-cosmos-2',
      title: 'Newer',
      updatedAt: '2026-02-01T00:00:00.000Z',
    });

    expect(await repos.quizzes.get(owner, quiz.id)).toEqual(quiz);
    expect(await repos.quizzes.get('someone-else', quiz.id)).toBeNull();
    expect((await repos.quizzes.list(owner)).map((q) => [q.id, q.questionCount])).toEqual([
      ['quiz-cosmos-2', 3],
      ['quiz-cosmos-1', 3],
    ]);

    expect(await repos.quizzes.delete(owner, quiz.id)).toBe(true);
    expect(await repos.quizzes.delete(owner, quiz.id)).toBe(false);
    expect(await repos.quizzes.get(owner, quiz.id)).toBeNull();
  }, 30_000);

  it('stores session results with answers, summaries and TTL', async () => {
    const quiz = makeQuiz();
    const session: SessionRecord = {
      id: `session-${Date.now()}`,
      ownerId: owner,
      quizId: quiz.id,
      quizTitle: quiz.title,
      pin: '123456',
      status: 'completed',
      startedAt: '2026-05-01T10:00:00.000Z',
      endedAt: '2026-05-01T10:05:00.000Z',
      questions: quiz.questions,
      players: [
        {
          playerId: 'p1',
          nickname: 'Ann',
          kart: { model: 'bolt', color: 'red' },
          score: 950,
          correctCount: 1,
          rank: 1,
        },
        {
          playerId: 'p2',
          nickname: 'Ben',
          kart: { model: 'truck', color: 'blue' },
          score: 0,
          correctCount: 0,
          rank: 2,
        },
      ],
      questionStats: [],
      ttl: 3600,
    };
    const answers: QuestionAnswersRecord = {
      id: `${session.id}_0`,
      sessionId: session.id,
      questionIndex: 0,
      questionId: 'q1',
      answers: [
        {
          playerId: 'p1',
          nickname: 'Ann',
          optionId: 'a',
          text: null,
          responseMs: 2000,
          correct: true,
          points: 950,
          hidden: false,
        },
      ],
      ttl: 3600,
    };
    await repos.sessions.saveSession(session);
    await repos.sessions.saveQuestionAnswers(answers);

    expect(await repos.sessions.listSessions(owner)).toEqual([
      expect.objectContaining({
        id: session.id,
        playerCount: 2,
        questionCount: 3,
        winner: { nickname: 'Ann', score: 950 },
      }),
    ]);
    expect(await repos.sessions.getSession(owner, session.id)).toEqual(session);
    expect(await repos.sessions.listQuestionAnswers(session.id)).toEqual([answers]);

    expect(await repos.sessions.deleteSession(owner, session.id)).toBe(true);
    expect(await repos.sessions.getSession(owner, session.id)).toBeNull();
    expect(await repos.sessions.listQuestionAnswers(session.id)).toEqual([]);
  }, 30_000);
});
