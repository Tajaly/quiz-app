import type {
  QuestionAnswersRecord,
  Quiz,
  QuizSummary,
  SessionRecord,
  SessionSummary,
} from '@power-quiz/shared';
import {
  toQuizSummary,
  toSessionSummary,
  type QuizRepository,
  type Repositories,
  type SessionRepository,
} from './types';

/** Volatile storage for local development and tests. Data is lost when the process stops. */
export class InMemoryQuizRepository implements QuizRepository {
  private readonly quizzes = new Map<string, Quiz>();

  async list(ownerId: string): Promise<QuizSummary[]> {
    return [...this.quizzes.values()]
      .filter((quiz) => quiz.ownerId === ownerId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(toQuizSummary);
  }

  async get(ownerId: string, id: string): Promise<Quiz | null> {
    const quiz = this.quizzes.get(id);
    return quiz && quiz.ownerId === ownerId ? structuredClone(quiz) : null;
  }

  async save(quiz: Quiz): Promise<Quiz> {
    this.quizzes.set(quiz.id, structuredClone(quiz));
    return structuredClone(quiz);
  }

  async delete(ownerId: string, id: string): Promise<boolean> {
    const quiz = this.quizzes.get(id);
    if (!quiz || quiz.ownerId !== ownerId) return false;
    return this.quizzes.delete(id);
  }
}

export class InMemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly answers = new Map<string, QuestionAnswersRecord>();

  async saveSession(record: SessionRecord): Promise<void> {
    this.sessions.set(record.id, structuredClone(record));
  }

  async saveQuestionAnswers(record: QuestionAnswersRecord): Promise<void> {
    this.answers.set(record.id, structuredClone(record));
  }

  async listSessions(ownerId: string): Promise<SessionSummary[]> {
    return [...this.sessions.values()]
      .filter((session) => session.ownerId === ownerId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map(toSessionSummary);
  }

  async getSession(ownerId: string, id: string): Promise<SessionRecord | null> {
    const session = this.sessions.get(id);
    return session && session.ownerId === ownerId ? structuredClone(session) : null;
  }

  async listQuestionAnswers(sessionId: string): Promise<QuestionAnswersRecord[]> {
    return [...this.answers.values()]
      .filter((record) => record.sessionId === sessionId)
      .sort((a, b) => a.questionIndex - b.questionIndex)
      .map((record) => structuredClone(record));
  }

  async deleteSession(ownerId: string, id: string): Promise<boolean> {
    const session = this.sessions.get(id);
    if (!session || session.ownerId !== ownerId) return false;
    this.sessions.delete(id);
    for (const [key, record] of this.answers) {
      if (record.sessionId === id) this.answers.delete(key);
    }
    return true;
  }
}

export function createInMemoryRepositories(): Repositories {
  return { quizzes: new InMemoryQuizRepository(), sessions: new InMemorySessionRepository() };
}
