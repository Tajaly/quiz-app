import { useCallback, useEffect, useRef, useState } from 'react';
import type { AckResponse, AnswerPayload, Kart, PlayerCredentials, PlayerView } from '@power-quiz/shared';
import { createSocket, emitAck, type QuizSocket, type Timed } from '../../lib/socket';
import { clearCredentials, loadCredentials, saveCredentials, saveLastPlayer } from '../../lib/storage';

export type PlayerStatus = 'connecting' | 'join' | 'joined' | 'kicked' | 'over';

const offline = {
  ok: false,
  code: 'INTERNAL',
  error: 'Not connected to the race yet. Please try again.',
} as const;

export function usePlayerSession(pin: string) {
  const [status, setStatus] = useState<PlayerStatus>('connecting');
  const [timed, setTimed] = useState<Timed<PlayerView> | null>(null);
  const [online, setOnline] = useState(true);
  const socketRef = useRef<QuizSocket | null>(null);

  useEffect(() => {
    const socket = createSocket({ role: 'player' });
    socketRef.current = socket;
    let lastPhase: PlayerView['phase'] | null = null;

    socket.on('connect', () => {
      setOnline(true);
      const credentials = loadCredentials(pin);
      if (!credentials) {
        setStatus((current) => (current === 'kicked' || current === 'over' ? current : 'join'));
        return;
      }
      // Returning device (reload, dropped Wi-Fi, locked screen): restore the same racer.
      void emitAck<{ credentials: PlayerCredentials }>(socket, 'player:rejoin', {
        sessionId: credentials.sessionId,
        playerToken: credentials.playerToken,
      }).then((response) => {
        if (response.ok) {
          setStatus('joined');
          return;
        }
        clearCredentials(pin);
        if (response.code === 'ENDED') {
          // The race is gone for good. Keep showing final results if we have them, and never look the
          // old PIN up again (each lookup would count as a wrong PIN for the whole venue's IP).
          if (lastPhase === 'final' || lastPhase === 'ended') return;
          setTimed(null);
          setStatus('over');
          return;
        }
        setTimed(null);
        setStatus(response.code === 'KICKED' ? 'kicked' : 'join');
      });
    });
    socket.on('disconnect', () => setOnline(false));
    socket.on('connect_error', () => setOnline(false));
    socket.on('player:view', (view) => {
      lastPhase = view.phase;
      setTimed({ view, receivedAt: performance.now() });
    });
    socket.on('player:kicked', () => {
      clearCredentials(pin);
      setStatus('kicked');
    });
    socket.connect();

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [pin]);

  const join = useCallback(
    async (nickname: string, kart: Kart): Promise<AckResponse<{ credentials: PlayerCredentials }>> => {
      const socket = socketRef.current;
      if (!socket?.connected) return offline;
      const response = await emitAck<{ credentials: PlayerCredentials }>(socket, 'player:join', {
        pin,
        nickname,
        kart,
      });
      if (response.ok) {
        saveCredentials(response.credentials);
        saveLastPlayer({ nickname, kart });
        setStatus('joined');
      }
      return response;
    },
    [pin],
  );

  const answer = useCallback(async (payload: AnswerPayload): Promise<AckResponse> => {
    const socket = socketRef.current;
    if (!socket) return offline;
    return emitAck(socket, 'player:answer', payload);
  }, []);

  return { status, timed, online, join, answer };
}
