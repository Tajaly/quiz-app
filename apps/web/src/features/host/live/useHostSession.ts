import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ClientToServerEvents, HostView } from '@power-quiz/shared';
import { useAuth } from '../../../auth/AuthProvider';
import { createSocket, emitAck, type QuizSocket, type Timed } from '../../../lib/socket';

export type HostConnection = 'connecting' | 'online' | 'offline' | 'denied';

export function useHostSession(sessionId: string) {
  const { getToken, mode } = useAuth();
  const [timed, setTimed] = useState<Timed<HostView> | null>(null);
  const [connection, setConnection] = useState<HostConnection>('connecting');
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<QuizSocket | null>(null);

  useEffect(() => {
    let credentialError: string | null = null;
    const socket = createSocket((callback) => {
      getToken().then(
        (token) => {
          credentialError = null;
          callback({ role: 'host', token });
        },
        (tokenError: unknown) => {
          credentialError =
            tokenError instanceof Error ? tokenError.message : 'Could not load your host key.';
          callback({ role: 'host', token: '' });
        },
      );
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnection('online');
      void emitAck(socket, 'host:attach', { sessionId }).then((response) => {
        if (response.ok) return;
        setError(response.error);
        if (response.code === 'NOT_FOUND' || response.code === 'FORBIDDEN') setConnection('denied');
      });
    });
    socket.on('disconnect', () => setConnection('offline'));
    socket.on('connect_error', (connectError) => {
      if (connectError.message === 'UNAUTHORIZED') {
        setConnection('denied');
        setError(
          credentialError ??
            (mode === 'guest'
              ? 'Your host key is not valid. Open this race in the browser that created it.'
              : 'Your sign-in has expired. Reload the page to sign in again.'),
        );
      } else {
        setConnection('offline');
      }
    });
    socket.on('host:view', (view) => setTimed({ view, receivedAt: performance.now() }));
    socket.connect();

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [sessionId, getToken, mode]);

  const command = useCallback(async (event: keyof ClientToServerEvents, payload?: unknown) => {
    const socket = socketRef.current;
    if (!socket) return;
    const response = await emitAck(socket, event, payload);
    if (!response.ok) setError(response.error);
  }, []);

  const actions = useMemo(
    () => ({
      start: () => command('host:start'),
      next: () => command('host:next'),
      endQuestion: () => command('host:endQuestion'),
      end: () => command('host:end'),
      setLocked: (locked: boolean) => command('host:setLocked', { locked }),
      kick: (playerId: string) => command('host:kick', { playerId }),
      hideAnswer: (questionIndex: number, playerId: string, hidden: boolean) =>
        command('host:hideAnswer', { questionIndex, playerId, hidden }),
    }),
    [command],
  );

  const clearError = useCallback(() => setError(null), []);

  return { timed, connection, error, clearError, ...actions };
}
