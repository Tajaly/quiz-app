import type {
  QuestionAnswersRecord,
  Quiz,
  QuizSummary,
  SessionRecord,
  SessionSummary,
} from '@power-quiz/shared';

export interface QuizRepository {
  list(ownerId: string): Promise<QuizSummary[]>;
  get(ownerId: string, id: string): Promise<Quiz | null>;
  save(quiz: Quiz): Promise<Quiz>;
  delete(ownerId: string, id: string): Promise<boolean>;
}

export interface SessionRepository {
  saveSession(record: SessionRecord): Promise<void>;
  saveQuestionAnswers(record: QuestionAnswersRecord): Promise<void>;
  listSessions(ownerId: string): Promise<SessionSummary[]>;
  getSession(ownerId: string, id: string): Promise<SessionRecord | null>;
  listQuestionAnswers(sessionId: string): Promise<QuestionAnswersRecord[]>;
  deleteSession(ownerId: string, id: string): Promise<boolean>;
}

export interface Repositories {
  quizzes: QuizRepository;
  sessions: SessionRepository;
}

export function toQuizSummary(quiz: Quiz): QuizSummary {
  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    questionCount: quiz.questions.length,
    updatedAt: quiz.updatedAt,
  };
}

export function toSessionSummary(record: SessionRecord): SessionSummary {
  const winner = record.players[0];
  return {
    id: record.id,
    quizId: record.quizId,
    quizTitle: record.quizTitle,
    status: record.status,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    playerCount: record.players.length,
    questionCount: record.questions.length,
    winner: winner ? { nickname: winner.nickname, score: winner.score } : null,
  };
}
