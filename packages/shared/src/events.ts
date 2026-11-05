import type { ErrorCode } from './errors';
import type { Kart } from './karts';
import type { HostView, PlayerCredentials, PlayerView } from './types';

export type AckResponse<T extends object = object> =
  ({ ok: true } & T) | { ok: false; code: ErrorCode; error: string };

export type AckCallback<T extends object = object> = (response: AckResponse<T>) => void;

export interface JoinPayload {
  pin: string;
  nickname: string;
  kart: Kart;
}

export interface RejoinPayload {
  sessionId: string;
  playerToken: string;
}

export interface SelectPayload {
  questionIndex: number;
  optionId: string;
}

export interface AnswerPayload {
  questionIndex: number;
  optionId?: string;
  text?: string;
}

export interface ClientToServerEvents {
  'host:attach': (payload: { sessionId: string }, ack: AckCallback) => void;
  'host:start': (ack: AckCallback) => void;
  'host:next': (ack: AckCallback) => void;
  'host:endQuestion': (ack: AckCallback) => void;
  'host:setLocked': (payload: { locked: boolean }, ack: AckCallback) => void;
  'host:kick': (payload: { playerId: string }, ack: AckCallback) => void;
  'host:hideAnswer': (
    payload: { questionIndex: number; playerId: string; hidden: boolean },
    ack: AckCallback,
  ) => void;
  'host:end': (ack: AckCallback) => void;
  'player:join': (payload: JoinPayload, ack: AckCallback<{ credentials: PlayerCredentials }>) => void;
  'player:rejoin': (payload: RejoinPayload, ack: AckCallback<{ credentials: PlayerCredentials }>) => void;
  /** Picks or switches a multiple-choice option without submitting it. */
  'player:select': (payload: SelectPayload, ack: AckCallback) => void;
  /** Submits the final answer. Picks that are never submitted count when the question closes. */
  'player:answer': (payload: AnswerPayload, ack: AckCallback) => void;
}

export interface ServerToClientEvents {
  'host:view': (view: HostView) => void;
  'player:view': (view: PlayerView) => void;
  'player:kicked': () => void;
}

export type SocketHandshakeAuth = { role: 'host'; token: string } | { role: 'player' };
