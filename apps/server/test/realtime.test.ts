import type { AddressInfo } from 'node:net';
import { io as connectClient, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  AckResponse,
  ClientToServerEvents,
  HostView,
  PlayerCredentials,
  PlayerView,
  ServerToClientEvents,
  SocketHandshakeAuth,
} from '@power-quiz/shared';
import { createDevAuthenticator } from '../src/auth/authenticator';
import { silentLogger } from '../src/logger';
import { createInMemoryRepositories } from '../src/repositories/memory';
import { createPowerQuizServer, PIN_FAILURES_PER_MINUTE, type PowerQuizServer } from '../src/server';
import { makeQuiz, testConfig } from './helpers';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

class Client<V> {
  readonly views: V[] = [];
  private waiters: Array<{ predicate: (view: V) => boolean; resolve: (view: V) => void }> = [];

  constructor(
    readonly socket: ClientSocket,
    event: 'host:view' | 'player:view',
  ) {
    socket.on(
      event as 'host:view',
      ((view: V) => {
        this.views.push(view);
        this.waiters = this.waiters.filter((waiter) => {
          if (!waiter.predicate(view)) return true;
          waiter.resolve(view);
          return false;
        });
      }) as unknown as (view: HostView) => void,
    );
  }

  get latest(): V | undefined {
    return this.views.at(-1);
  }

  waitFor(predicate: (view: V) => boolean, timeoutMs = 3000): Promise<V> {
    const existing = this.latest;
    if (existing && predicate(existing)) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for view')), timeoutMs);
      this.waiters.push({
        predicate,
        resolve: (view) => {
          clearTimeout(timer);
          resolve(view);
        },
      });
    });
  }

  emit<T extends object = object>(event: string, ...args: unknown[]): Promise<AckResponse<T>> {
    return new Promise((resolve) => {
      (this.socket.emit as (...params: unknown[]) => void)(event, ...args, resolve);
    });
  }
}

let server: PowerQuizServer;
let url: string;
const sockets: ClientSocket[] = [];

function openSocket(auth: SocketHandshakeAuth): Promise<ClientSocket> {
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

const host = async (name = 'Alice') =>
  new Client<HostView>(await openSocket({ role: 'host', token: `dev:${name}` }), 'host:view');
const player = async () => new Client<PlayerView>(await openSocket({ role: 'player' }), 'player:view');

async function join(client: Client<PlayerView>, pin: string, nickname: string): Promise<PlayerCredentials> {
  const response = await client.emit<{ credentials: PlayerCredentials }>('player:join', {
    pin,
    nickname,
    kart: { model: 'rocket', color: 'cyan' },
  });
  if (!response.ok) throw new Error(response.error);
  return response.credentials;
}

describe('realtime gateway', () => {
  beforeEach(async () => {
    server = createPowerQuizServer({
      config: testConfig(),
      logger: silentLogger(),
      auth: createDevAuthenticator(),
      repos: createInMemoryRepositories(),
      staticDir: null,
      countdownMs: 30,
    });
    await new Promise<void>((resolve) => server.httpServer.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.disconnect();
    await server.close();
  });

  it('plays a question end to end with host and players in sync', async () => {
    const session = server.manager.create('dev-alice', makeQuiz());
    const screen = await host();
    expect(await screen.emit('host:attach', { sessionId: session.id })).toEqual({ ok: true });
    await screen.waitFor((view) => view.phase === 'lobby');

    const ann = await player();
    const ben = await player();
    const annCredentials = await join(ann, session.pin, 'Ann');
    await join(ben, session.pin, 'Ben');
    expect(annCredentials).toMatchObject({ sessionId: session.id, pin: session.pin });
    expect((await ann.waitFor((view) => view.playerCount === 2)).me.nickname).toBe('Ann');
    const lobby = await screen.waitFor((view) => view.players.length === 2);
    expect(lobby.players.map((p) => p.nickname)).toEqual(['Ann', 'Ben']);

    expect(await screen.emit('host:start')).toEqual({ ok: true });
    const question = await ann.waitFor((view) => view.phase === 'question');
    expect(question.question).toMatchObject({ index: 0, text: 'Capital of France?' });
    expect(question.timer?.totalMs).toBe(20_000);

    expect(await ann.emit('player:answer', { questionIndex: 0, optionId: 'a' })).toEqual({ ok: true });
    expect((await screen.waitFor((view) => view.answeredCount === 1)).phase).toBe('question');
    expect(await ben.emit('player:answer', { questionIndex: 0, optionId: 'b' })).toEqual({ ok: true });

    const reveal = await screen.waitFor((view) => view.phase === 'reveal');
    expect(reveal.reveal).toMatchObject({
      type: 'mc',
      correctOptionId: 'a',
      answeredCount: 2,
      correctCount: 1,
    });
    const annResult = await ann.waitFor((view) => view.phase === 'reveal');
    expect(annResult.result).toMatchObject({ correct: true, rank: 1 });
    expect((await ben.waitFor((view) => view.phase === 'reveal')).result).toMatchObject({
      correct: false,
      rank: 2,
    });

    expect(await ann.emit('player:answer', { questionIndex: 0, optionId: 'a' })).toMatchObject({
      ok: false,
      code: 'TOO_LATE',
    });

    expect(await screen.emit('host:next')).toEqual({ ok: true });
    const scoreboard = await screen.waitFor((view) => view.phase === 'scoreboard');
    expect(scoreboard.scoreboard?.entries.map((entry) => entry.nickname)).toEqual(['Ann', 'Ben']);
  });

  it('restores a player after a dropped connection', async () => {
    const session = server.manager.create('dev-alice', makeQuiz());
    const screen = await host();
    await screen.emit('host:attach', { sessionId: session.id });
    const phone = await player();
    const credentials = await join(phone, session.pin, 'Ann');
    await screen.waitFor((view) => view.connectedCount === 1);

    phone.socket.disconnect();
    expect((await screen.waitFor((view) => view.connectedCount === 0)).playerCount).toBe(1);

    const again = await player();
    const response = await again.emit<{ credentials: PlayerCredentials }>('player:rejoin', {
      sessionId: credentials.sessionId,
      playerToken: credentials.playerToken,
    });
    expect(response).toEqual({ ok: true, credentials });
    expect((await again.waitFor((view) => view.me.id === credentials.playerId)).me.nickname).toBe('Ann');
    await screen.waitFor((view) => view.connectedCount === 1);
  });

  it('keeps only the newest connection of a player', async () => {
    const session = server.manager.create('dev-alice', makeQuiz());
    const first = await player();
    const credentials = await join(first, session.pin, 'Ann');
    const disconnected = new Promise<void>((resolve) => first.socket.once('disconnect', () => resolve()));
    const second = await player();
    await second.emit('player:rejoin', {
      sessionId: credentials.sessionId,
      playerToken: credentials.playerToken,
    });
    await disconnected;
    expect(session.hostView().connectedCount).toBe(1);
  });

  it('lets the host kick a player who then cannot rejoin', async () => {
    const session = server.manager.create('dev-alice', makeQuiz());
    const screen = await host();
    await screen.emit('host:attach', { sessionId: session.id });
    const phone = await player();
    const credentials = await join(phone, session.pin, 'Troll');
    const kicked = new Promise<void>((resolve) => phone.socket.once('player:kicked', () => resolve()));

    expect(await screen.emit('host:kick', { playerId: credentials.playerId })).toEqual({ ok: true });
    await kicked;
    await screen.waitFor((view) => view.playerCount === 0);

    const again = await player();
    expect(
      await again.emit('player:rejoin', {
        sessionId: credentials.sessionId,
        playerToken: credentials.playerToken,
      }),
    ).toMatchObject({ ok: false, code: 'KICKED' });
  });

  it('rejects unauthenticated hosts and hosts of other races', async () => {
    await expect(openSocket({ role: 'host', token: 'forged' })).rejects.toThrow('UNAUTHORIZED');

    const session = server.manager.create('dev-alice', makeQuiz());
    const mallory = await host('Mallory');
    expect(await mallory.emit('host:start')).toMatchObject({ ok: false, code: 'NOT_ATTACHED' });
    expect(await mallory.emit('host:attach', { sessionId: session.id })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });
    expect(await mallory.emit('host:attach', { sessionId: 'missing' })).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    });
  });

  it('validates player input and limits PIN guessing', async () => {
    const session = server.manager.create('dev-alice', makeQuiz());
    const phone = await player();
    expect(await phone.emit('player:answer', { questionIndex: 0, optionId: 'a' })).toMatchObject({
      code: 'NOT_ATTACHED',
    });
    expect(
      await phone.emit('player:join', {
        pin: session.pin,
        nickname: '',
        kart: { model: 'rocket', color: 'cyan' },
      }),
    ).toMatchObject({ ok: false, code: 'INVALID' });

    for (let attempt = 0; attempt < PIN_FAILURES_PER_MINUTE; attempt++) {
      expect(
        await phone.emit('player:join', {
          pin: '999999',
          nickname: 'Ann',
          kart: { model: 'rocket', color: 'cyan' },
        }),
      ).toMatchObject({ code: 'NOT_FOUND' });
    }
    expect(
      await phone.emit('player:join', {
        pin: session.pin,
        nickname: 'Ann',
        kart: { model: 'rocket', color: 'cyan' },
      }),
    ).toMatchObject({ code: 'RATE_LIMITED' });
  });
});
