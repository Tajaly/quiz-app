import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANSWER_GRACE_MS, COUNTDOWN_MS, LIMITS, type Kart, type Quiz } from '@power-quiz/shared';
import { makeQuiz, RecordingSink } from '../../test/helpers';
import { LiveSession, SessionError, type ChangeScope } from './LiveSession';
import { createModeration } from './moderation';

const kart: Kart = { model: 'classic', color: 'red' };

function setup(quiz: Quiz = makeQuiz(), maxPlayers?: number) {
  const sink = new RecordingSink();
  const session = new LiveSession({
    id: 'session-1',
    pin: '123456',
    ownerId: 'dev-alice',
    quiz,
    sink,
    moderation: createModeration(),
    maxPlayers,
  });
  const join = (nickname: string) => session.addPlayer({ nickname, kart }).playerId;
  const openQuestion = () => vi.advanceTimersByTime(COUNTDOWN_MS);
  return { session, sink, join, openQuestion };
}

function expectCode(action: () => unknown, code: string): void {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(SessionError);
  expect((caught as SessionError).code).toBe(code);
}

describe('LiveSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('joining', () => {
    it('lists players in join order in the lobby', () => {
      const { session, join } = setup();
      join('Alice');
      join('Bob');
      const view = session.hostView();
      expect(view.phase).toBe('lobby');
      expect(view.playerCount).toBe(2);
      expect(view.players.map((p) => p.nickname)).toEqual(['Alice', 'Bob']);
    });

    it('keeps nicknames unique regardless of case and spacing', () => {
      const { join } = setup();
      join('Turbo Tom');
      expectCode(() => join('turbo tom'), 'NAME_TAKEN');
    });

    it('rejects profane nicknames', () => {
      const { join } = setup();
      expectCode(() => join('fuckface'), 'NAME_REJECTED');
    });

    it('blocks joining while locked and when full', () => {
      const { session, join } = setup(makeQuiz(), 2);
      session.setLocked(true);
      expectCode(() => join('Alice'), 'LOCKED');
      session.setLocked(false);
      join('Alice');
      join('Bob');
      expectCode(() => join('Cara'), 'FULL');
      expect(session.joinInfo().joinable).toBe(false);
    });

    it('fits 300-player races by default and stops at the player limit', () => {
      const { session, join } = setup();
      for (let racer = 1; racer <= 300; racer++) join(`Racer ${racer}`);
      expect(session.joinInfo().joinable).toBe(true);
      for (let racer = 301; racer <= LIMITS.playersPerSessionMax; racer++) join(`Racer ${racer}`);
      expect(session.playerCount).toBe(LIMITS.playersPerSessionMax);
      expectCode(() => join('Latecomer'), 'FULL');
    });

    it('rejoins a returning device with its token', () => {
      const { session } = setup();
      const { playerId, token } = session.addPlayer({ nickname: 'Alice', kart });
      expect(session.rejoin(token).playerId).toBe(playerId);
      expectCode(() => session.rejoin('not-a-real-token-123'), 'NOT_FOUND');
    });
  });

  it('runs a full race with speed scoring, reveals, scoreboards and final standings', async () => {
    const { session, sink, join, openQuestion } = setup();
    const alice = join('Alice');
    const bob = join('Bob');
    const cara = join('Cara');

    session.start();
    expect(session.phase).toBe('countdown');
    expect(session.hostView().countdown).toEqual({ remainingMs: COUNTDOWN_MS, totalMs: COUNTDOWN_MS });
    expect(session.hostView().players).toEqual([]);

    // Question 1 (20 s): Cara wrong after 1 s, Alice right after 2 s, Bob right after 10 s.
    openQuestion();
    expect(session.phase).toBe('question');
    expect(session.hostView().timer).toEqual({ remainingMs: 20_000, totalMs: 20_000 });
    vi.advanceTimersByTime(1000);
    session.submitAnswer(cara, { questionIndex: 0, optionId: 'b' });
    vi.advanceTimersByTime(1000);
    session.submitAnswer(alice, { questionIndex: 0, optionId: 'a' });
    expect(session.hostView().answeredCount).toBe(2);
    expect(session.playerView(alice)?.myAnswer).toEqual({ optionId: 'a', text: null });
    vi.advanceTimersByTime(8000);
    session.submitAnswer(bob, { questionIndex: 0, optionId: 'a' });

    expect(session.phase).toBe('reveal');
    expect(session.hostView().reveal).toEqual({
      type: 'mc',
      correctOptionId: 'a',
      distribution: [
        { optionId: 'a', count: 2 },
        { optionId: 'b', count: 1 },
        { optionId: 'c', count: 0 },
      ],
      answeredCount: 3,
      correctCount: 2,
      playerCount: 3,
      avgResponseMs: Math.round((1000 + 2000 + 10_000) / 3),
    });
    expect(session.playerView(alice)?.result).toMatchObject({
      correct: true,
      points: 950,
      totalScore: 950,
      rank: 1,
    });
    expect(session.playerView(bob)?.result).toMatchObject({
      correct: true,
      points: 750,
      rank: 2,
      gapToNext: 200,
      nextNickname: 'Alice',
    });
    expect(session.playerView(cara)?.result).toMatchObject({
      correct: false,
      points: 0,
      rank: 3,
      correctOption: { id: 'a', text: 'Paris' },
    });

    session.next();
    expect(session.phase).toBe('scoreboard');
    expect(session.hostView().scoreboard).toEqual({
      leaderScore: 950,
      totalPlayers: 3,
      entries: [
        expect.objectContaining({
          nickname: 'Alice',
          score: 950,
          previousScore: 0,
          rank: 1,
          previousRank: null,
          lastPoints: 950,
        }),
        expect.objectContaining({
          nickname: 'Bob',
          score: 750,
          rank: 2,
          previousRank: null,
          lastPoints: 750,
        }),
        expect.objectContaining({ nickname: 'Cara', score: 0, rank: 3, previousRank: null, lastPoints: 0 }),
      ],
    });

    // Question 2 (10 s): Bob right after 1 s, Alice wrong, Cara right after 5 s.
    session.next();
    expect(session.phase).toBe('countdown');
    expect(session.hostView().questionIndex).toBe(1);
    openQuestion();
    vi.advanceTimersByTime(1000);
    session.submitAnswer(bob, { questionIndex: 1, optionId: 'b' });
    vi.advanceTimersByTime(1000);
    session.submitAnswer(alice, { questionIndex: 1, optionId: 'a' });
    vi.advanceTimersByTime(3000);
    session.submitAnswer(cara, { questionIndex: 1, optionId: 'b' });
    expect(session.phase).toBe('reveal');

    session.next();
    const scoreboard = session.hostView().scoreboard;
    expect(scoreboard?.entries.map((e) => [e.nickname, e.score, e.rank, e.previousRank])).toEqual([
      ['Bob', 1700, 1, 2],
      ['Alice', 950, 2, 1],
      ['Cara', 750, 3, 3],
    ]);

    // Question 3 (open): two answers, then the timer runs out.
    session.next();
    openQuestion();
    session.submitAnswer(alice, { questionIndex: 2, text: 'Blue' });
    vi.advanceTimersByTime(500);
    session.submitAnswer(bob, { questionIndex: 2, text: '  racing   red ' });
    vi.advanceTimersByTime(15_000 + ANSWER_GRACE_MS);
    expect(session.phase).toBe('reveal');
    const openReveal = session.hostView().reveal;
    expect(openReveal?.type).toBe('open');
    expect(openReveal?.type === 'open' && openReveal.answers.map((a) => [a.nickname, a.text])).toEqual([
      ['Alice', 'Blue'],
      ['Bob', 'racing red'],
    ]);
    expect(session.playerView(cara)?.result).toMatchObject({ answered: false, correct: null, points: 0 });

    // Open questions skip the scoreboard; the last question leads to the podium.
    session.next();
    expect(session.phase).toBe('final');
    expect(session.hostView().final?.ranking.map((p) => [p.nickname, p.rank])).toEqual([
      ['Bob', 1],
      ['Alice', 2],
      ['Cara', 3],
    ]);
    expect(session.playerView(cara)?.final).toMatchObject({ rank: 3, score: 750, totalPlayers: 3 });
    expect(session.playerView(cara)?.final?.podium).toHaveLength(3);

    session.next();
    expect(session.phase).toBe('ended');
    await session.flush();
    expect(sink.answers.map((record) => record.questionIndex)).toEqual([0, 1, 2]);
    const record = sink.sessions.at(-1);
    expect(record?.status).toBe('completed');
    expect(record?.players.map((p) => p.nickname)).toEqual(['Bob', 'Alice', 'Cara']);
    expect(record?.questionStats).toHaveLength(3);
    expect(record?.questionStats[0]).toMatchObject({ answeredCount: 3, correctCount: 2 });
  });

  it('closes on time, accepts answers within the grace window and rejects later ones', () => {
    const { session, join, openQuestion } = setup();
    const alice = join('Alice');
    const bob = join('Bob');
    join('Cara');
    session.start();
    openQuestion();

    vi.advanceTimersByTime(20_000 + ANSWER_GRACE_MS - 50);
    expect(session.phase).toBe('question');
    session.submitAnswer(alice, { questionIndex: 0, optionId: 'a' });
    vi.advanceTimersByTime(50);
    expect(session.phase).toBe('reveal');
    expect(session.playerView(alice)?.result?.points).toBe(500);
    expectCode(() => session.submitAnswer(bob, { questionIndex: 0, optionId: 'a' }), 'TOO_LATE');
  });

  it('auto-closes when every connected player has answered, ignoring disconnected ones', () => {
    const { session, join, openQuestion } = setup();
    const alice = join('Alice');
    const bob = join('Bob');
    session.start();
    openQuestion();
    session.submitAnswer(alice, { questionIndex: 0, optionId: 'a' });
    expect(session.phase).toBe('question');
    session.setConnected(bob, false);
    expect(session.phase).toBe('reveal');
  });

  it('lets the host end a question early', () => {
    const { session, join, openQuestion } = setup();
    join('Alice');
    session.start();
    expectCode(() => session.endQuestion(), 'WRONG_PHASE');
    openQuestion();
    session.endQuestion();
    expect(session.phase).toBe('reveal');
    expect(session.hostView().reveal).toMatchObject({ answeredCount: 0, playerCount: 1 });
  });

  it('rejects double answers, wrong question indexes and unknown options', () => {
    const { session, join, openQuestion } = setup();
    const alice = join('Alice');
    join('Bob');
    session.start();
    openQuestion();
    expectCode(() => session.submitAnswer(alice, { questionIndex: 0, optionId: 'zzz' }), 'INVALID');
    expectCode(() => session.submitAnswer(alice, { questionIndex: 1, optionId: 'a' }), 'TOO_LATE');
    session.submitAnswer(alice, { questionIndex: 0, optionId: 'a' });
    expectCode(() => session.submitAnswer(alice, { questionIndex: 0, optionId: 'b' }), 'ALREADY_ANSWERED');
  });

  it('never exposes the correct answer before the reveal', () => {
    const { session, join, openQuestion } = setup();
    const alice = join('Alice');
    join('Bob');
    session.start();
    expect(JSON.stringify(session.hostView())).not.toContain('correctOptionId');
    openQuestion();
    session.submitAnswer(alice, { questionIndex: 0, optionId: 'a' });
    expect(JSON.stringify(session.hostView())).not.toContain('correctOptionId');
    expect(JSON.stringify(session.playerView(alice))).not.toContain('correctOption');
    expect(session.playerView(alice)?.me.score).toBe(0);
  });

  it('censors open answers and lets the host hide them', async () => {
    const quiz = makeQuiz({
      questions: [{ id: 'q1', type: 'open', text: 'Say something', timeLimitSec: 10 }],
    });
    const { session, sink, join, openQuestion } = setup(quiz);
    const alice = join('Alice');
    session.start();
    openQuestion();
    session.submitAnswer(alice, { questionIndex: 0, text: 'this is shit' });
    expect(session.phase).toBe('reveal');
    const reveal = session.hostView().reveal;
    expect(reveal?.type === 'open' && reveal.answers[0]?.text).toBe('this is ****');

    session.hideAnswer(0, alice, true);
    const hidden = session.hostView().reveal;
    expect(hidden?.type === 'open' && hidden.answers[0]?.hidden).toBe(true);
    await session.flush();
    expect(sink.answers.at(-1)?.answers[0]?.hidden).toBe(true);
    expectCode(() => session.hideAnswer(0, 'nobody', true), 'NOT_FOUND');
  });

  it('lets late joiners answer the current question with zero points so far', () => {
    const { session, join, openQuestion } = setup();
    const alice = join('Alice');
    session.start();
    openQuestion();
    session.submitAnswer(alice, { questionIndex: 0, optionId: 'a' });
    // Alice was the only player, so the question closed; late joiners can still hop in.
    expect(session.phase).toBe('reveal');
    const dan = join('Dan');
    expect(session.playerView(dan)?.me).toMatchObject({ score: 0, rank: 2 });
    session.next();
    session.next();
    openQuestion();
    session.submitAnswer(dan, { questionIndex: 1, optionId: 'b' });
    expect(session.playerView(dan)?.myAnswer?.optionId).toBe('b');
  });

  it('removes kicked players from rankings and refuses their token', () => {
    const { session, openQuestion } = setup();
    const alice = session.addPlayer({ nickname: 'Alice', kart }).playerId;
    const bob = session.addPlayer({ nickname: 'Bob', kart });
    session.start();
    openQuestion();
    session.submitAnswer(alice, { questionIndex: 0, optionId: 'a' });
    session.kick(bob.playerId);
    // Bob was the last player who had not answered, so the question closes.
    expect(session.phase).toBe('reveal');
    expect(session.hostView().playerCount).toBe(1);
    expect(session.playerView(bob.playerId)).toBeNull();
    expectCode(() => session.rejoin(bob.token), 'KICKED');
    expectCode(() => session.kick(bob.playerId), 'NOT_FOUND');
  });

  it('persists an aborted race when the host ends it mid-question', async () => {
    const { session, sink, join, openQuestion } = setup();
    const alice = join('Alice');
    join('Bob');
    session.start();
    openQuestion();
    vi.advanceTimersByTime(1000);
    session.submitAnswer(alice, { questionIndex: 0, optionId: 'a' });
    session.end();
    expect(session.phase).toBe('ended');
    expect(session.hostView().final?.ranking[0]).toMatchObject({ nickname: 'Alice', score: 975 });
    await session.flush();
    expect(sink.sessions.at(-1)?.status).toBe('aborted');
    expect(sink.answers).toHaveLength(1);
    expectCode(() => session.next(), 'ENDED');
  });

  it('does not persist a race that never started', async () => {
    const { session, sink, join } = setup();
    join('Alice');
    session.end();
    await session.flush();
    expect(session.phase).toBe('ended');
    expect(session.hostView().final).toBeNull();
    expect(sink.sessions).toHaveLength(0);
  });

  it('notifies listeners with the smallest useful scope', () => {
    const { session, join, openQuestion } = setup();
    const scopes: ChangeScope[] = [];
    session.onChange((scope) => scopes.push(scope));
    const alice = join('Alice');
    join('Bob');
    session.start();
    openQuestion();
    scopes.length = 0;
    session.submitAnswer(alice, { questionIndex: 0, optionId: 'a' });
    expect(scopes).toEqual([{ host: true, players: [alice] }]);
  });
});
