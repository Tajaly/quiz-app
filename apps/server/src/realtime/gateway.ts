import type { Server, Socket } from 'socket.io';
import { ZodError } from 'zod';
import {
  answerPayloadSchema,
  hideAnswerSchema,
  hostAttachSchema,
  joinPayloadSchema,
  kickSchema,
  rejoinPayloadSchema,
  setLockedSchema,
  type AckResponse,
  type ClientToServerEvents,
  type PlayerCredentials,
  type ServerToClientEvents,
  type UserInfo,
} from '@power-quiz/shared';
import type { Authenticator } from '../auth/authenticator';
import { SessionError, type ChangeScope, type LiveSession } from '../game/LiveSession';
import type { SessionManager } from '../game/SessionManager';
import type { Logger } from '../logger';
import { clientIp, type FailureLimiter } from '../net';

export interface SocketData {
  role: 'host' | 'player';
  ip: string;
  user?: UserInfo;
  sessionId?: string;
  playerId?: string;
}

type InterServerEvents = Record<string, never>;
export type QuizIoServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type QuizSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export interface RealtimeDeps {
  manager: SessionManager;
  auth: Authenticator;
  logger: Logger;
  pinLimiter: FailureLimiter;
  trustProxy: number;
}

const hostRoom = (sessionId: string) => `host:${sessionId}`;

export function attachRealtime(io: QuizIoServer, deps: RealtimeDeps): void {
  const { manager, logger } = deps;
  const subscriptions = new Map<string, () => void>();
  const playerSockets = new Map<string, Map<string, QuizSocket>>();
  const pending = new Map<string, { host: boolean; players: Set<string> | 'all' }>();

  manager.onRemoved((sessionId) => {
    subscriptions.get(sessionId)?.();
    subscriptions.delete(sessionId);
    playerSockets.delete(sessionId);
    pending.delete(sessionId);
  });

  function subscribe(session: LiveSession): void {
    if (subscriptions.has(session.id)) return;
    subscriptions.set(
      session.id,
      session.onChange((scope) => schedule(session, scope)),
    );
  }

  // Views are full snapshots, so bursts of changes (e.g. many answers) are coalesced into one emit.
  function schedule(session: LiveSession, scope: ChangeScope): void {
    let entry = pending.get(session.id);
    if (!entry) {
      entry = { host: false, players: new Set() };
      pending.set(session.id, entry);
      setImmediate(() => flush(session));
    }
    entry.host ||= scope.host;
    if (scope.players === 'all') entry.players = 'all';
    else if (entry.players !== 'all') for (const id of scope.players) entry.players.add(id);
  }

  function flush(session: LiveSession): void {
    const entry = pending.get(session.id);
    pending.delete(session.id);
    if (!entry) return;
    if (entry.host) io.to(hostRoom(session.id)).emit('host:view', session.hostView());
    const sockets = playerSockets.get(session.id);
    if (!sockets) return;
    const ids = entry.players === 'all' ? [...sockets.keys()] : [...entry.players];
    for (const playerId of ids) {
      const view = session.playerView(playerId);
      if (view) sockets.get(playerId)?.emit('player:view', view);
    }
  }

  function respond<T extends object>(ack: unknown, handler: () => T | void): void {
    if (typeof ack !== 'function') return;
    const reply = ack as (response: AckResponse<T>) => void;
    try {
      const result = handler();
      reply({ ok: true, ...(result ?? {}) } as AckResponse<T>);
    } catch (error) {
      if (error instanceof SessionError) {
        reply({ ok: false, code: error.code, error: error.message });
      } else if (error instanceof ZodError) {
        reply({ ok: false, code: 'INVALID', error: error.issues[0]?.message ?? 'Invalid request.' });
      } else {
        logger.error({ err: error }, 'Socket handler failed');
        reply({ ok: false, code: 'INTERNAL', error: 'Something went wrong. Please try again.' });
      }
    }
  }

  function hostSession(socket: QuizSocket): LiveSession {
    const sessionId = socket.data.sessionId;
    if (!sessionId) throw new SessionError('NOT_ATTACHED', 'Open the race screen first.');
    const session = manager.get(sessionId);
    if (!session) throw new SessionError('NOT_FOUND', 'This race no longer exists.');
    if (session.ownerId !== socket.data.user?.id)
      throw new SessionError('FORBIDDEN', 'This is not your race.');
    return session;
  }

  function bindPlayer(socket: QuizSocket, session: LiveSession, playerId: string): void {
    const previousSession = socket.data.sessionId;
    const previousPlayer = socket.data.playerId;
    if (
      previousSession &&
      previousPlayer &&
      (previousSession !== session.id || previousPlayer !== playerId)
    ) {
      const previous = playerSockets.get(previousSession);
      if (previous?.get(previousPlayer) === socket) {
        previous.delete(previousPlayer);
        manager.get(previousSession)?.setConnected(previousPlayer, false);
      }
    }

    let sockets = playerSockets.get(session.id);
    if (!sockets) {
      sockets = new Map();
      playerSockets.set(session.id, sockets);
    }
    const existing = sockets.get(playerId);
    if (existing && existing !== socket) {
      // The same player opened the race on another tab/device: keep only the newest connection.
      existing.data.sessionId = undefined;
      existing.data.playerId = undefined;
      existing.disconnect(true);
    }
    sockets.set(playerId, socket);
    socket.data.sessionId = session.id;
    socket.data.playerId = playerId;
    subscribe(session);
    session.setConnected(playerId, true);
    schedule(session, { host: false, players: [playerId] });
  }

  function registerHost(socket: QuizSocket): void {
    socket.on('host:attach', (payload, ack) =>
      respond(ack, () => {
        const { sessionId } = hostAttachSchema.parse(payload);
        const session = manager.get(sessionId);
        if (!session) throw new SessionError('NOT_FOUND', 'This race no longer exists.');
        if (session.ownerId !== socket.data.user?.id)
          throw new SessionError('FORBIDDEN', 'This is not your race.');
        if (socket.data.sessionId && socket.data.sessionId !== sessionId) {
          void socket.leave(hostRoom(socket.data.sessionId));
        }
        socket.data.sessionId = sessionId;
        void socket.join(hostRoom(sessionId));
        subscribe(session);
        schedule(session, { host: true, players: [] });
      }),
    );
    socket.on('host:start', (ack) => respond(ack, () => hostSession(socket).start()));
    socket.on('host:next', (ack) => respond(ack, () => hostSession(socket).next()));
    socket.on('host:endQuestion', (ack) => respond(ack, () => hostSession(socket).endQuestion()));
    socket.on('host:end', (ack) => respond(ack, () => hostSession(socket).end()));
    socket.on('host:setLocked', (payload, ack) =>
      respond(ack, () => hostSession(socket).setLocked(setLockedSchema.parse(payload).locked)),
    );
    socket.on('host:hideAnswer', (payload, ack) =>
      respond(ack, () => {
        const { questionIndex, playerId, hidden } = hideAnswerSchema.parse(payload);
        hostSession(socket).hideAnswer(questionIndex, playerId, hidden);
      }),
    );
    socket.on('host:kick', (payload, ack) =>
      respond(ack, () => {
        const session = hostSession(socket);
        const { playerId } = kickSchema.parse(payload);
        session.kick(playerId);
        const sockets = playerSockets.get(session.id);
        const playerSocket = sockets?.get(playerId);
        if (playerSocket) {
          sockets?.delete(playerId);
          playerSocket.data.sessionId = undefined;
          playerSocket.data.playerId = undefined;
          playerSocket.emit('player:kicked');
          setTimeout(() => playerSocket.disconnect(true), 250);
        }
      }),
    );
  }

  function registerPlayer(socket: QuizSocket): void {
    socket.on('player:join', (payload, ack) =>
      respond<{ credentials: PlayerCredentials }>(ack, () => {
        if (deps.pinLimiter.isLimited(socket.data.ip)) {
          throw new SessionError('RATE_LIMITED', 'Too many wrong PINs. Please wait a minute and try again.');
        }
        const input = joinPayloadSchema.parse(payload);
        const session = manager.getByPin(input.pin);
        if (!session) {
          deps.pinLimiter.recordFailure(socket.data.ip);
          throw new SessionError('NOT_FOUND', 'No race found with that PIN.');
        }
        const { playerId, token } = session.addPlayer({ nickname: input.nickname, kart: input.kart });
        bindPlayer(socket, session, playerId);
        return { credentials: { sessionId: session.id, pin: session.pin, playerId, playerToken: token } };
      }),
    );
    socket.on('player:rejoin', (payload, ack) =>
      respond<{ credentials: PlayerCredentials }>(ack, () => {
        const input = rejoinPayloadSchema.parse(payload);
        const session = manager.get(input.sessionId);
        if (!session) throw new SessionError('ENDED', 'This race is over.');
        const { playerId } = session.rejoin(input.playerToken);
        bindPlayer(socket, session, playerId);
        return {
          credentials: { sessionId: session.id, pin: session.pin, playerId, playerToken: input.playerToken },
        };
      }),
    );
    socket.on('player:answer', (payload, ack) =>
      respond(ack, () => {
        const { sessionId, playerId } = socket.data;
        if (!sessionId || !playerId) throw new SessionError('NOT_ATTACHED', 'Join the race first.');
        const session = manager.get(sessionId);
        if (!session) throw new SessionError('ENDED', 'This race is over.');
        session.submitAnswer(playerId, answerPayloadSchema.parse(payload));
      }),
    );
    socket.on('disconnect', () => {
      const { sessionId, playerId } = socket.data;
      if (!sessionId || !playerId) return;
      const sockets = playerSockets.get(sessionId);
      if (sockets?.get(playerId) === socket) {
        sockets.delete(playerId);
        manager.get(sessionId)?.setConnected(playerId, false);
      }
    });
  }

  io.use(async (socket, next) => {
    socket.data.ip = clientIp(
      socket.handshake.headers['x-forwarded-for'],
      socket.handshake.address,
      deps.trustProxy,
    );
    const auth = (socket.handshake.auth ?? {}) as { role?: unknown; token?: unknown };
    if (auth.role === 'host') {
      try {
        if (typeof auth.token !== 'string') throw new Error('missing token');
        socket.data.user = await deps.auth.verify(auth.token);
        socket.data.role = 'host';
        next();
      } catch {
        next(new Error('UNAUTHORIZED'));
      }
      return;
    }
    socket.data.role = 'player';
    next();
  });

  io.on('connection', (socket) => {
    if (socket.data.role === 'host') registerHost(socket);
    else registerPlayer(socket);
  });
}
