import { randomInt, randomUUID } from 'node:crypto';
import type { LiveSessionSummary, QuestionAnswersRecord, Quiz, SessionRecord } from '@power-quiz/shared';
import type { Logger } from '../logger';
import type { SessionRepository } from '../repositories/types';
import { LiveSession, SessionError, type ResultsSink } from './LiveSession';
import type { Moderation } from './moderation';

export interface SessionManagerOptions {
  sink: ResultsSink;
  moderation: Moderation;
  logger?: Logger;
  maxSessions?: number;
  maxSessionsPerOwner?: number;
  /** How long a finished race stays reachable so phones can still show the final results. */
  endedRetentionMs?: number;
  /** Races without any activity for this long are ended automatically. */
  idleTimeoutMs?: number;
  countdownMs?: number;
}

export class SessionManager {
  private readonly sessions = new Map<string, LiveSession>();
  private readonly byPin = new Map<string, LiveSession>();
  private readonly removedListeners = new Set<(sessionId: string) => void>();
  private readonly maxSessions: number;
  private readonly maxSessionsPerOwner: number;
  private readonly endedRetentionMs: number;
  private readonly idleTimeoutMs: number;

  constructor(private readonly options: SessionManagerOptions) {
    this.maxSessions = options.maxSessions ?? 100;
    this.maxSessionsPerOwner = options.maxSessionsPerOwner ?? 5;
    this.endedRetentionMs = options.endedRetentionMs ?? 15 * 60_000;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 3 * 60 * 60_000;
  }

  create(ownerId: string, quiz: Quiz): LiveSession {
    if (quiz.questions.length === 0) {
      throw new SessionError('INVALID', 'Add at least one question before starting a race.');
    }
    // Finished races don't count towards the limits, so nobody can block others by ending races quickly.
    const active = [...this.sessions.values()].filter((session) => session.phase !== 'ended');
    if (active.length >= this.maxSessions) {
      throw new SessionError('FULL', 'The server is busy right now. Please try again in a few minutes.');
    }
    const owned = active.filter((session) => session.ownerId === ownerId);
    if (owned.length >= this.maxSessionsPerOwner) {
      throw new SessionError(
        'FULL',
        `You can run at most ${this.maxSessionsPerOwner} live races at once. End one of them first.`,
      );
    }
    this.evictFinished(this.maxSessions);
    const session = new LiveSession({
      id: randomUUID(),
      pin: this.generatePin(),
      ownerId,
      quiz: structuredClone(quiz),
      sink: this.options.sink,
      moderation: this.options.moderation,
      countdownMs: this.options.countdownMs,
      onError: (error) => this.options.logger?.error({ err: error }, 'Live session error'),
    });
    this.sessions.set(session.id, session);
    this.byPin.set(session.pin, session);
    this.options.logger?.info({ sessionId: session.id, quizId: quiz.id }, 'Live race created');
    return session;
  }

  get(sessionId: string): LiveSession | undefined {
    return this.sessions.get(sessionId);
  }

  getByPin(pin: string): LiveSession | undefined {
    return this.byPin.get(pin);
  }

  listForOwner(ownerId: string): LiveSessionSummary[] {
    return [...this.sessions.values()]
      .filter((session) => session.ownerId === ownerId && session.phase !== 'ended')
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((session) => session.summary());
  }

  remove(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.end();
    session.dispose();
    this.sessions.delete(sessionId);
    if (this.byPin.get(session.pin) === session) this.byPin.delete(session.pin);
    for (const listener of this.removedListeners) listener(sessionId);
  }

  onRemoved(listener: (sessionId: string) => void): () => void {
    this.removedListeners.add(listener);
    return () => this.removedListeners.delete(listener);
  }

  sweep(now = Date.now()): void {
    for (const session of [...this.sessions.values()]) {
      const idleMs = now - session.lastActivityAt;
      if (session.phase === 'ended') {
        if (idleMs >= this.endedRetentionMs) this.remove(session.id);
      } else if (idleMs >= this.idleTimeoutMs) {
        this.options.logger?.info({ sessionId: session.id }, 'Ending idle race');
        session.end();
      }
    }
  }

  startSweeper(intervalMs = 60_000): () => void {
    const timer = setInterval(() => this.sweep(), intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }

  /** Ends all races (persisting their results) and waits for pending writes. */
  async shutdown(): Promise<void> {
    const sessions = [...this.sessions.values()];
    for (const session of sessions) session.end();
    await Promise.all(sessions.map((session) => session.flush()));
    for (const session of sessions) this.remove(session.id);
  }

  /** Keeps at most `keep` finished races around (oldest go first) so memory stays bounded. */
  private evictFinished(keep: number): void {
    const finished = [...this.sessions.values()]
      .filter((session) => session.phase === 'ended')
      .sort((a, b) => a.lastActivityAt - b.lastActivityAt);
    for (const session of finished.slice(0, Math.max(0, finished.length - keep))) this.remove(session.id);
  }

  private generatePin(): string {
    for (let attempt = 0; attempt < 100; attempt++) {
      const pin = String(randomInt(100_000, 1_000_000));
      if (!this.byPin.has(pin)) return pin;
    }
    throw new SessionError('FULL', 'Could not allocate a PIN. Please try again.');
  }
}

/** Persists race results through the session repository, stamping the configured retention (TTL). */
export class RepositoryResultsSink implements ResultsSink {
  constructor(
    private readonly repository: SessionRepository,
    private readonly ttlSeconds: number,
  ) {}

  saveSession(record: SessionRecord): Promise<void> {
    return this.repository.saveSession({ ...record, ttl: this.ttlSeconds });
  }

  saveQuestionAnswers(record: QuestionAnswersRecord): Promise<void> {
    return this.repository.saveQuestionAnswers({ ...record, ttl: this.ttlSeconds });
  }
}
