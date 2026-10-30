import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { io as connectClient, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  ClientToServerEvents,
  PlayerView,
  Quiz,
  ServerToClientEvents,
  StartSessionResponse,
} from '@power-quiz/shared';
import { createGuestAuthenticator } from '../src/auth/authenticator';
import { loadConfig } from '../src/config';
import { silentLogger } from '../src/logger';
import { createInMemoryRepositories } from '../src/repositories/memory';
import { createPowerQuizServer, type PowerQuizServer } from '../src/server';
import { makeQuiz } from './helpers';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
const aliceKey = `guest:${randomBytes(32).toString('hex')}`;
const bobKey = `guest:${randomBytes(32).toString('hex')}`;
const headers = (key: string) => ({ Authorization: `Bearer ${key}` });

let server: PowerQuizServer;
let repos: ReturnType<typeof createInMemoryRepositories>;
let url: string;
const sockets: ClientSocket[] = [];

async function startServer() {
  server = createPowerQuizServer({
    config: loadConfig({ NODE_ENV: 'production', PORT: '0' }),
    logger: silentLogger(),
    auth: createGuestAuthenticator(),
    repos,
    staticDir: null,
    countdownMs: 30,
  });
  await new Promise<void>((resolve) => server.httpServer.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;
}

async function createQuiz(): Promise<Quiz> {
  const response = await request(server.app)
    .post('/api/quizzes')
    .set(headers(aliceKey))
    .send({ title: 'Private guest quiz', questions: makeQuiz().questions, ownerId: 'not-trusted' })
    .expect(201);
  return response.body as Quiz;
}

async function createRace(quizId: string): Promise<StartSessionResponse> {
  const response = await request(server.app)
    .post('/api/sessions')
    .set(headers(aliceKey))
    .send({ quizId })
    .expect(201);
  return response.body as StartSessionResponse;
}

function openSocket(auth: { role: 'host' | 'player'; token?: string }): Promise<ClientSocket> {
  const socket: ClientSocket = connectClient(url, {
    auth,
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
  sockets.push(socket);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

describe('production guest hosting', () => {
  beforeEach(async () => {
    repos = createInMemoryRepositories();
    await startServer();
  });

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.disconnect();
    await server.close();
  });

  it('needs no Entra settings but still requires a private key for host APIs', async () => {
    await request(server.app).get('/api/config').expect(200, { authMode: 'guest', entra: null });
    await request(server.app).get('/api/quizzes').expect(401);
    await request(server.app).get('/api/me').set(headers('dev:Alice')).expect(401);
    const response = await request(server.app).get('/api/me').set(headers(aliceKey)).expect(200);
    expect(response.body).toEqual({
      id: expect.stringMatching(/^guest-[\w-]{43}$/),
      name: 'Guest host',
    });
    expect(JSON.stringify(response.body)).not.toContain(aliceKey.slice(6));
  });

  it('keeps quiz reads, edits, copies, deletion and race creation private to the browser key', async () => {
    const quiz = await createQuiz();
    expect(quiz.ownerId).not.toBe('not-trusted');
    await request(server.app).get(`/api/quizzes/${quiz.id}`).set(headers(aliceKey)).expect(200);
    await request(server.app).get('/api/quizzes').set(headers(bobKey)).expect(200, []);
    await request(server.app).get(`/api/quizzes/${quiz.id}`).set(headers(bobKey)).expect(404);
    await request(server.app).put(`/api/quizzes/${quiz.id}`).set(headers(bobKey)).send(quiz).expect(404);
    await request(server.app).post(`/api/quizzes/${quiz.id}/duplicate`).set(headers(bobKey)).expect(404);
    await request(server.app).delete(`/api/quizzes/${quiz.id}`).set(headers(bobKey)).expect(404);
    await request(server.app)
      .post('/api/sessions')
      .set(headers(bobKey))
      .send({ quizId: quiz.id })
      .expect(404);
    await request(server.app).get(`/api/quizzes/${quiz.id}`).set(headers(quiz.ownerId)).expect(401);
    await request(server.app)
      .put(`/api/quizzes/${quiz.id}`)
      .set(headers(aliceKey))
      .send({ ...quiz, title: 'Updated guest quiz' })
      .expect(200);
    await request(server.app).post(`/api/quizzes/${quiz.id}/duplicate`).set(headers(aliceKey)).expect(201);
    await request(server.app).delete(`/api/quizzes/${quiz.id}`).set(headers(aliceKey)).expect(204);
  });

  it('keeps live races, saved results and CSV exports private while PIN lookup remains public', async () => {
    const quiz = await createQuiz();
    const race = await createRace(quiz.id);
    const info = await request(server.app).get(`/api/live/${race.pin}`).expect(200);
    expect(JSON.stringify(info.body)).not.toContain(aliceKey.slice(6));
    expect(info.body.ownerId).toBeUndefined();
    await request(server.app).get('/api/sessions/live').set(headers(bobKey)).expect(200, []);
    await request(server.app).get('/api/sessions/live').set(headers(race.pin)).expect(401);

    const session = server.manager.get(race.sessionId);
    if (!session) throw new Error('Race missing');
    session.start();
    session.end();
    await session.flush();

    await request(server.app).get('/api/sessions').set(headers(bobKey)).expect(200, []);
    await request(server.app).get(`/api/sessions/${race.sessionId}`).set(headers(bobKey)).expect(404);
    await request(server.app)
      .get(`/api/sessions/${race.sessionId}/results.csv`)
      .set(headers(bobKey))
      .expect(404);
    await request(server.app).delete(`/api/sessions/${race.sessionId}`).set(headers(bobKey)).expect(404);
    await request(server.app)
      .get(`/api/sessions/${race.sessionId}/results.csv`)
      .set(headers(aliceKey))
      .expect(200);
    await request(server.app).delete(`/api/sessions/${race.sessionId}`).set(headers(aliceKey)).expect(204);
  });

  it('rejects missing keys, other hosts, PINs and player tokens for live host controls', async () => {
    const quiz = await createQuiz();
    const race = await createRace(quiz.id);
    await expect(openSocket({ role: 'host' })).rejects.toThrow('UNAUTHORIZED');
    await expect(openSocket({ role: 'host', token: race.pin })).rejects.toThrow('UNAUTHORIZED');

    const owner = await openSocket({ role: 'host', token: aliceKey });
    expect(await owner.timeout(2000).emitWithAck('host:attach', { sessionId: race.sessionId })).toEqual({
      ok: true,
    });
    const otherHost = await openSocket({ role: 'host', token: bobKey });
    expect(
      await otherHost.timeout(2000).emitWithAck('host:attach', { sessionId: race.sessionId }),
    ).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });

    const player = await openSocket({ role: 'player' });
    const view = new Promise<PlayerView>((resolve) => player.once('player:view', resolve));
    const joined = await player.timeout(2000).emitWithAck('player:join', {
      pin: race.pin,
      nickname: 'Racer',
      kart: { model: 'rocket', color: 'cyan' },
    });
    if (!joined.ok) throw new Error(joined.error);
    expect(JSON.stringify(await view)).not.toContain(aliceKey.slice(6));
    await expect(openSocket({ role: 'host', token: joined.credentials.playerToken })).rejects.toThrow(
      'UNAUTHORIZED',
    );
    await expect(player.timeout(100).emitWithAck('host:end')).rejects.toThrow(/timed out/);
    expect(server.manager.get(race.sessionId)?.phase).toBe('lobby');

    owner.disconnect();
    const reloaded = await openSocket({ role: 'host', token: aliceKey });
    expect(await reloaded.timeout(2000).emitWithAck('host:attach', { sessionId: race.sessionId })).toEqual({
      ok: true,
    });
    expect(await reloaded.timeout(2000).emitWithAck('host:setLocked', { locked: true })).toEqual({
      ok: true,
    });
    expect(server.manager.get(race.sessionId)?.joinInfo().locked).toBe(true);
  });

  it('preserves ownership across a server restart when the repository is retained', async () => {
    const quiz = await createQuiz();
    await server.close();
    await startServer();
    const response = await request(server.app)
      .get(`/api/quizzes/${quiz.id}`)
      .set(headers(aliceKey))
      .expect(200);
    expect(response.body).toEqual(quiz);
    await request(server.app).get(`/api/quizzes/${quiz.id}`).set(headers(bobKey)).expect(404);
  });
});
