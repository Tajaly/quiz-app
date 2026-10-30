import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Quiz, QuizInput } from '@power-quiz/shared';
import { createDevAuthenticator } from '../src/auth/authenticator';
import { silentLogger } from '../src/logger';
import { createInMemoryRepositories } from '../src/repositories/memory';
import { createPowerQuizServer, PIN_FAILURES_PER_MINUTE, type PowerQuizServer } from '../src/server';
import { devAuthHeader, testConfig } from './helpers';

const alice = devAuthHeader('Alice');
const bob = devAuthHeader('Bob');

const quizInput: QuizInput = {
  title: 'Space race',
  description: 'Planets and stars',
  questions: [
    {
      id: 'q1',
      type: 'mc',
      text: 'Largest planet?',
      options: [
        { id: 'a', text: 'Jupiter' },
        { id: 'b', text: 'Mars' },
      ],
      correctOptionId: 'a',
      timeLimitSec: 20,
    },
    { id: 'q2', type: 'open', text: 'Name a star', timeLimitSec: 30 },
  ],
};

let server: PowerQuizServer;

function createServer(staticDir: string | null = null) {
  return createPowerQuizServer({
    config: testConfig(),
    logger: silentLogger(),
    auth: createDevAuthenticator(),
    repos: createInMemoryRepositories(),
    staticDir,
  });
}

async function createQuiz(input: QuizInput = quizInput): Promise<Quiz> {
  const response = await request(server.app).post('/api/quizzes').set(alice).send(input).expect(201);
  return response.body as Quiz;
}

describe('HTTP API', () => {
  beforeEach(() => {
    server = createServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it('reports health and client configuration', async () => {
    await request(server.app).get('/healthz').expect(200, { status: 'ok' });
    await request(server.app).get('/api/config').expect(200, { authMode: 'dev', entra: null });
  });

  it('sets security headers', async () => {
    const response = await request(server.app).get('/healthz');
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('requires sign-in for host APIs', async () => {
    await request(server.app).get('/api/quizzes').expect(401);
    await request(server.app).get('/api/quizzes').set('Authorization', 'Bearer nonsense').expect(401);
    await request(server.app).get('/api/me').set(alice).expect(200, { id: 'dev-alice', name: 'Alice' });
  });

  it('creates, lists, updates, duplicates and deletes quizzes', async () => {
    const quiz = await createQuiz();
    expect(quiz).toMatchObject({ title: 'Space race', ownerId: 'dev-alice' });

    const list = await request(server.app).get('/api/quizzes').set(alice).expect(200);
    expect(list.body).toEqual([
      expect.objectContaining({ id: quiz.id, title: 'Space race', questionCount: 2 }),
    ]);

    const updated = await request(server.app)
      .put(`/api/quizzes/${quiz.id}`)
      .set(alice)
      .send({ ...quizInput, title: 'Space race II' })
      .expect(200);
    expect(updated.body).toMatchObject({ id: quiz.id, title: 'Space race II', createdAt: quiz.createdAt });

    const copy = await request(server.app).post(`/api/quizzes/${quiz.id}/duplicate`).set(alice).expect(201);
    expect(copy.body).toMatchObject({ title: 'Copy of Space race II' });
    expect(copy.body.id).not.toBe(quiz.id);

    await request(server.app).delete(`/api/quizzes/${quiz.id}`).set(alice).expect(204);
    await request(server.app).get(`/api/quizzes/${quiz.id}`).set(alice).expect(404);
  });

  it('validates quiz input', async () => {
    const response = await request(server.app)
      .post('/api/quizzes')
      .set(alice)
      .send({ title: '', questions: [{ ...quizInput.questions[0], correctOptionId: 'zzz' }] })
      .expect(400);
    expect(response.body.issues).toEqual(
      expect.arrayContaining([
        { path: 'title', message: 'Title is required' },
        { path: 'questions.0.correctOptionId', message: 'Mark the correct answer' },
      ]),
    );
    await request(server.app)
      .post('/api/quizzes')
      .set(alice)
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400);
  });

  it('keeps every lead’s quizzes private', async () => {
    const quiz = await createQuiz();
    await request(server.app).get(`/api/quizzes/${quiz.id}`).set(bob).expect(404);
    await request(server.app).put(`/api/quizzes/${quiz.id}`).set(bob).send(quizInput).expect(404);
    await request(server.app).delete(`/api/quizzes/${quiz.id}`).set(bob).expect(404);
    await request(server.app).post('/api/sessions').set(bob).send({ quizId: quiz.id }).expect(404);
    const list = await request(server.app).get('/api/quizzes').set(bob).expect(200);
    expect(list.body).toEqual([]);
  });

  it('starts live races and looks them up by PIN', async () => {
    const quiz = await createQuiz();
    const started = await request(server.app)
      .post('/api/sessions')
      .set(alice)
      .send({ quizId: quiz.id })
      .expect(201);
    expect(started.body.pin).toMatch(/^\d{6}$/);

    const live = await request(server.app).get('/api/sessions/live').set(alice).expect(200);
    expect(live.body).toEqual([
      expect.objectContaining({ sessionId: started.body.sessionId, phase: 'lobby' }),
    ]);

    const info = await request(server.app).get(`/api/live/${started.body.pin}`).expect(200);
    expect(info.body).toEqual({
      sessionId: started.body.sessionId,
      quizTitle: 'Space race',
      phase: 'lobby',
      locked: false,
      joinable: true,
    });
    await request(server.app).get('/api/live/000000').expect(404);
    await request(server.app).get('/api/live/abc').expect(404);
  });

  it('refuses to start a quiz without questions', async () => {
    const quiz = await createQuiz({ ...quizInput, questions: [] });
    const response = await request(server.app)
      .post('/api/sessions')
      .set(alice)
      .send({ quizId: quiz.id })
      .expect(400);
    expect(response.body.code).toBe('INVALID');
  });

  it('rate-limits PIN guessing', async () => {
    for (let attempt = 0; attempt < PIN_FAILURES_PER_MINUTE; attempt++) {
      await request(server.app).get('/api/live/111111').expect(404);
    }
    await request(server.app).get('/api/live/111111').expect(429);
  });

  it('stores race results and exports them as CSV', async () => {
    const quiz = await createQuiz();
    const started = await request(server.app)
      .post('/api/sessions')
      .set(alice)
      .send({ quizId: quiz.id })
      .expect(201);
    const session = server.manager.get(started.body.sessionId);
    if (!session) throw new Error('session missing');
    session.addPlayer({ nickname: 'Zoe', kart: { model: 'rocket', color: 'cyan' } });
    session.start();
    session.end();
    await session.flush();

    const history = await request(server.app).get('/api/sessions').set(alice).expect(200);
    expect(history.body).toEqual([
      expect.objectContaining({
        id: session.id,
        quizTitle: 'Space race',
        status: 'aborted',
        playerCount: 1,
        questionCount: 2,
        winner: { nickname: 'Zoe', score: 0 },
      }),
    ]);
    await request(server.app).get('/api/sessions').set(bob).expect(200, []);

    const detail = await request(server.app).get(`/api/sessions/${session.id}`).set(alice).expect(200);
    expect(detail.body.session.players).toHaveLength(1);
    await request(server.app).get(`/api/sessions/${session.id}`).set(bob).expect(404);

    const csv = await request(server.app)
      .get(`/api/sessions/${session.id}/results.csv`)
      .set(alice)
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain('power-quiz-space-race-');
    expect(csv.text).toContain('Rank,Nickname,Score');
    expect(csv.text).toContain('1,Zoe,0,0');

    await request(server.app).delete(`/api/sessions/${session.id}`).set(bob).expect(404);
    await request(server.app).delete(`/api/sessions/${session.id}`).set(alice).expect(204);
    await request(server.app).get(`/api/sessions/${session.id}`).set(alice).expect(404);
  });

  it('answers unknown API routes with JSON 404s', async () => {
    const response = await request(server.app).get('/api/nope').set(alice).expect(404);
    expect(response.body).toEqual({ error: 'Not found.' });
  });
});

describe('static web app hosting', () => {
  let dir: string;

  beforeAll(() => {
    // A dot-folder in the path (like `.deploy/`) must not block serving the app.
    dir = path.join(mkdtempSync(path.join(tmpdir(), 'power-quiz-web-')), '.deploy', 'public');
    mkdirSync(path.join(dir, 'assets'), { recursive: true });
    writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Power Quiz</title>');
    writeFileSync(path.join(dir, 'assets', 'app-123.js'), 'console.log(1)');
  });

  afterAll(() => {
    rmSync(path.resolve(dir, '..', '..'), { recursive: true, force: true });
  });

  beforeEach(() => {
    server = createServer(dir);
  });

  afterEach(async () => {
    await server.close();
  });

  it('serves hashed assets with long caching and falls back to index.html for client routes', async () => {
    const asset = await request(server.app).get('/assets/app-123.js').expect(200);
    expect(asset.headers['cache-control']).toContain('immutable');

    const page = await request(server.app).get('/host/live/abc').expect(200);
    expect(page.text).toContain('<title>Power Quiz</title>');
    expect(page.headers['cache-control']).toBe('no-cache');

    await request(server.app).get('/api/unknown').expect(401);
    await request(server.app).post('/somewhere').expect(404);
  });
});
