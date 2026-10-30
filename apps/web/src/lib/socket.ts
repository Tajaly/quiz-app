import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  AckResponse,
  ClientToServerEvents,
  ServerToClientEvents,
  SocketHandshakeAuth,
  TimerInfo,
} from '@power-quiz/shared';

export type QuizSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

type AuthProvider = SocketHandshakeAuth | ((callback: (data: SocketHandshakeAuth) => void) => void);

export function createSocket(auth: AuthProvider): QuizSocket {
  return io({
    autoConnect: false,
    auth,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
    timeout: 10_000,
  });
}

/** Emits an event and resolves with the server's acknowledgement (or a timeout error). */
export function emitAck<T extends object = object>(
  socket: QuizSocket,
  event: keyof ClientToServerEvents,
  payload?: unknown,
  timeoutMs = 8000,
): Promise<AckResponse<T>> {
  return new Promise((resolve) => {
    const args: unknown[] = payload === undefined ? [] : [payload];
    // Keep the call on the socket object: `emit` relies on `this`.
    const target = socket.timeout(timeoutMs) as unknown as { emit: (...params: unknown[]) => void };
    target.emit(event, ...args, (error: Error | null, response: AckResponse<T>) => {
      resolve(
        error
          ? { ok: false, code: 'INTERNAL', error: 'The server did not respond. Check your connection.' }
          : response,
      );
    });
  });
}

/** A server view plus the local time it arrived, so countdowns are immune to clock skew. */
export interface Timed<T> {
  view: T;
  receivedAt: number;
}

export function useRemainingMs(timer: TimerInfo | null | undefined, receivedAt: number): number {
  const deadline = timer ? receivedAt + timer.remainingMs : null;
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (deadline === null) return;
    setNow(performance.now());
    const id = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(id);
  }, [deadline]);
  return deadline === null ? 0 : Math.max(0, deadline - now);
}
