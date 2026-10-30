import type { z } from 'zod';
import type { Kart } from './karts';
import type {
  mcOptionSchema,
  mcQuestionSchema,
  openQuestionSchema,
  questionSchema,
  quizInputSchema,
} from './schemas';

// ---- Quizzes -------------------------------------------------------------------

export type McOption = z.infer<typeof mcOptionSchema>;
export type McQuestion = z.infer<typeof mcQuestionSchema>;
export type OpenQuestion = z.infer<typeof openQuestionSchema>;
export type Question = z.infer<typeof questionSchema>;
export type QuestionType = Question['type'];
export type QuizInput = z.infer<typeof quizInputSchema>;

export interface Quiz extends QuizInput {
  id: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuizSummary {
  id: string;
  title: string;
  description: string;
  questionCount: number;
  updatedAt: string;
}

export interface UserInfo {
  id: string;
  name: string;
  username?: string;
}

export interface ClientConfig {
  authMode: 'guest' | 'entra' | 'dev';
  entra: { clientId: string; tenantId: string; scope: string } | null;
}

// ---- Live sessions ---------------------------------------------------------------

export type SessionPhase = 'lobby' | 'countdown' | 'question' | 'reveal' | 'scoreboard' | 'final' | 'ended';

/** Durations are relative so that devices with skewed clocks still count down correctly. */
export interface TimerInfo {
  remainingMs: number;
  totalMs: number;
}

export interface PlayerPublic {
  id: string;
  nickname: string;
  kart: Kart;
  score: number;
  correctCount: number;
  rank: number;
  connected: boolean;
}

/** A question as shown to the room: never contains the correct answer. */
export interface QuestionPublic {
  index: number;
  id: string;
  type: QuestionType;
  text: string;
  options: McOption[] | null;
  timeLimitSec: number;
}

export interface OptionCount {
  optionId: string;
  count: number;
}

export interface McReveal {
  type: 'mc';
  correctOptionId: string;
  distribution: OptionCount[];
  answeredCount: number;
  correctCount: number;
  playerCount: number;
  avgResponseMs: number | null;
}

export interface OpenAnswerPublic {
  playerId: string;
  nickname: string;
  kart: Kart;
  text: string;
  hidden: boolean;
}

export interface OpenReveal {
  type: 'open';
  answers: OpenAnswerPublic[];
  answeredCount: number;
  playerCount: number;
}

export type RevealData = McReveal | OpenReveal;

export interface ScoreboardEntry {
  playerId: string;
  nickname: string;
  kart: Kart;
  score: number;
  previousScore: number;
  rank: number;
  previousRank: number | null;
  lastPoints: number;
}

export interface ScoreboardData {
  entries: ScoreboardEntry[];
  leaderScore: number;
  totalPlayers: number;
}

export interface RankedPlayer {
  playerId: string;
  nickname: string;
  kart: Kart;
  score: number;
  correctCount: number;
  rank: number;
}

export interface FinalData {
  ranking: RankedPlayer[];
  totalPlayers: number;
}

export interface HostView {
  sessionId: string;
  pin: string;
  quizTitle: string;
  phase: SessionPhase;
  locked: boolean;
  questionIndex: number;
  questionCount: number;
  playerCount: number;
  connectedCount: number;
  /** Full roster in join order; only populated in the lobby to keep in-game updates small. */
  players: PlayerPublic[];
  question: QuestionPublic | null;
  countdown: TimerInfo | null;
  timer: TimerInfo | null;
  answeredCount: number;
  reveal: RevealData | null;
  scoreboard: ScoreboardData | null;
  final: FinalData | null;
}

export interface PlayerAnswer {
  optionId: string | null;
  text: string | null;
}

export interface PlayerResult {
  questionIndex: number;
  type: QuestionType;
  answered: boolean;
  /** `null` for open questions, which are not scored. */
  correct: boolean | null;
  points: number;
  myAnswer: PlayerAnswer | null;
  correctOption: McOption | null;
  totalScore: number;
  rank: number;
  gapToNext: number | null;
  nextNickname: string | null;
}

export interface PlayerFinal {
  rank: number;
  score: number;
  correctCount: number;
  totalPlayers: number;
  podium: RankedPlayer[];
}

export interface PlayerView {
  sessionId: string;
  pin: string;
  quizTitle: string;
  phase: SessionPhase;
  questionIndex: number;
  questionCount: number;
  playerCount: number;
  me: { id: string; nickname: string; kart: Kart; score: number; rank: number };
  question: QuestionPublic | null;
  countdown: TimerInfo | null;
  timer: TimerInfo | null;
  myAnswer: PlayerAnswer | null;
  result: PlayerResult | null;
  final: PlayerFinal | null;
}

export interface PlayerCredentials {
  sessionId: string;
  pin: string;
  playerId: string;
  playerToken: string;
}

export interface LiveSessionSummary {
  sessionId: string;
  pin: string;
  quizId: string;
  quizTitle: string;
  phase: SessionPhase;
  playerCount: number;
  createdAt: string;
}

export interface JoinInfo {
  sessionId: string;
  quizTitle: string;
  phase: SessionPhase;
  locked: boolean;
  joinable: boolean;
}

export interface StartSessionResponse {
  sessionId: string;
  pin: string;
}

// ---- Persisted results -------------------------------------------------------------

export type SessionStatus = 'live' | 'completed' | 'aborted';

export interface QuestionStat {
  questionIndex: number;
  questionId: string;
  type: QuestionType;
  answeredCount: number;
  correctCount: number | null;
  distribution: OptionCount[] | null;
  avgResponseMs: number | null;
}

export interface SessionRecord {
  id: string;
  ownerId: string;
  quizId: string;
  quizTitle: string;
  pin: string;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  questions: Question[];
  players: RankedPlayer[];
  questionStats: QuestionStat[];
  /** Cosmos DB time-to-live in seconds. */
  ttl?: number;
}

export interface StoredAnswer {
  playerId: string;
  nickname: string;
  optionId: string | null;
  text: string | null;
  responseMs: number;
  correct: boolean | null;
  points: number;
  hidden: boolean;
}

export interface QuestionAnswersRecord {
  id: string;
  sessionId: string;
  questionIndex: number;
  questionId: string;
  answers: StoredAnswer[];
  ttl?: number;
}

export interface SessionSummary {
  id: string;
  quizId: string;
  quizTitle: string;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  playerCount: number;
  questionCount: number;
  winner: { nickname: string; score: number } | null;
}

export interface SessionDetail {
  session: SessionRecord;
  answers: QuestionAnswersRecord[];
}
