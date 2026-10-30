import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeQuiz, RecordingSink } from '../../test/helpers';
import { SessionError } from './LiveSession';
import { noModeration } from './moderation';
import { SessionManager, type SessionManagerOptions } from './SessionManager';

function createManager(options: Partial<SessionManagerOptions> = {}) {
  const sink = new RecordingSink();
  const manager = new SessionManager({ sink, moderation: noModeration, ...options });
  return { manager, sink };
}

describe('SessionManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refuses to start a quiz without questions', () => {
    const { manager } = createManager();
    expect(() => manager.create('owner', makeQuiz({ questions: [] }))).toThrow(SessionError);
  });

  it('allocates unique six-digit PINs and finds sessions by PIN', () => {
    const { manager } = createManager({ maxSessionsPerOwner: 50 });
    const sessions = Array.from({ length: 30 }, () => manager.create('owner', makeQuiz()));
    const pins = new Set(sessions.map((session) => session.pin));
    expect(pins.size).toBe(30);
    for (const session of sessions) {
      expect(session.pin).toMatch(/^[1-9]\d{5}$/);
      expect(manager.getByPin(session.pin)).toBe(session);
    }
  });

  it('snapshots the quiz so later edits do not affect a live race', () => {
    const { manager } = createManager();
    const quiz = makeQuiz();
    const session = manager.create('owner', quiz);
    quiz.title = 'Edited';
    expect(session.quiz.title).toBe('Grand Prix');
  });

  it('limits concurrent races per owner but not ended ones', () => {
    const { manager } = createManager({ maxSessionsPerOwner: 2 });
    const first = manager.create('owner', makeQuiz());
    manager.create('owner', makeQuiz());
    expect(() => manager.create('owner', makeQuiz())).toThrow(/at most 2/);
    first.end();
    expect(() => manager.create('owner', makeQuiz())).not.toThrow();
    expect(() => manager.create('someone-else', makeQuiz())).not.toThrow();
  });

  it('does not let finished races fill the server and evicts the oldest ones', () => {
    const { manager } = createManager({ maxSessions: 2, maxSessionsPerOwner: 5 });
    const finished = Array.from({ length: 3 }, () => {
      vi.advanceTimersByTime(1000);
      const session = manager.create('owner', makeQuiz());
      session.end();
      return session;
    });
    vi.advanceTimersByTime(1000);
    const live = manager.create('owner', makeQuiz());
    // Only two finished races are kept; the oldest one was evicted to make room.
    expect(manager.get(finished[0]!.id)).toBeUndefined();
    expect(manager.get(finished[1]!.id)).toBeDefined();
    expect(manager.get(live.id)).toBe(live);
    manager.create('other', makeQuiz());
    expect(() => manager.create('third', makeQuiz())).toThrow(/busy/);
  });

  it('lists only the owner’s running races', () => {
    const { manager } = createManager();
    const mine = manager.create('owner', makeQuiz());
    manager.create('other', makeQuiz());
    const ended = manager.create('owner', makeQuiz());
    ended.end();
    expect(manager.listForOwner('owner').map((s) => s.sessionId)).toEqual([mine.id]);
  });

  it('ends idle races and later removes ended ones', () => {
    const { manager } = createManager({ idleTimeoutMs: 60_000, endedRetentionMs: 30_000 });
    const removed: string[] = [];
    manager.onRemoved((id) => removed.push(id));
    const session = manager.create('owner', makeQuiz());

    vi.advanceTimersByTime(59_000);
    manager.sweep();
    expect(session.phase).toBe('lobby');

    vi.advanceTimersByTime(2_000);
    manager.sweep();
    expect(session.phase).toBe('ended');
    expect(manager.get(session.id)).toBe(session);

    vi.advanceTimersByTime(31_000);
    manager.sweep();
    expect(manager.get(session.id)).toBeUndefined();
    expect(manager.getByPin(session.pin)).toBeUndefined();
    expect(removed).toEqual([session.id]);
  });

  it('ends every race and flushes results on shutdown', async () => {
    const { manager, sink } = createManager();
    const session = manager.create('owner', makeQuiz());
    session.addPlayer({ nickname: 'Alice', kart: { model: 'bolt', color: 'blue' } });
    session.start();
    await manager.shutdown();
    expect(session.phase).toBe('ended');
    expect(sink.sessions.at(-1)?.status).toBe('aborted');
    expect(manager.get(session.id)).toBeUndefined();
  });
});
