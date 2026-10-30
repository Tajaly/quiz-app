import { randomBytes, randomUUID } from 'node:crypto';
import {
  ANSWER_GRACE_MS,
  COUNTDOWN_MS,
  LIMITS,
  PODIUM_SIZE,
  SCOREBOARD_SIZE,
  calculatePoints,
  nicknameKey,
  openAnswerSchema,
  rankPlayers,
  type AnswerPayload,
  type ErrorCode,
  type FinalData,
  type HostView,
  type JoinInfo,
  type Kart,
  type LiveSessionSummary,
  type PlayerFinal,
  type PlayerPublic,
  type PlayerResult,
  type PlayerView,
  type Question,
  type QuestionAnswersRecord,
  type QuestionPublic,
  type QuestionStat,
  type Quiz,
  type RankedPlayer,
  type RevealData,
  type ScoreboardData,
  type SessionPhase,
  type SessionRecord,
  type SessionStatus,
  type TimerInfo,
} from '@power-quiz/shared';
import type { Moderation } from './moderation';

export class SessionError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SessionError';
  }
}

/** Where finished questions and sessions are persisted (Cosmos DB in production). */
export interface ResultsSink {
  saveSession(record: SessionRecord): Promise<void>;
  saveQuestionAnswers(record: QuestionAnswersRecord): Promise<void>;
}

/** Which views changed: the host screen and/or some (or all) players. */
export interface ChangeScope {
  host: boolean;
  players: 'all' | readonly string[];
}

export interface LiveSessionOptions {
  id: string;
  pin: string;
  ownerId: string;
  quiz: Quiz;
  sink: ResultsSink;
  moderation: Moderation;
  maxPlayers?: number;
  /** Length of the pre-question countdown; only shortened in tests. */
  countdownMs?: number;
  onError?: (error: unknown) => void;
}

interface PlayerState {
  id: string;
  token: string;
  nickname: string;
  key: string;
  kart: Kart;
  joinOrder: number;
  connected: boolean;
  kicked: boolean;
  score: number;
  correctCount: number;
  correctTimeMs: number;
}

interface AnswerState {
  playerId: string;
  optionId: string | null;
  text: string | null;
  responseMs: number;
  correct: boolean | null;
  points: number;
  hidden: boolean;
}

interface Standing {
  score: number;
  rank: number;
}

interface QuestionRun {
  index: number;
  question: Question;
  timeLimitMs: number;
  openedAt: number;
  deadline: number;
  answers: Map<string, AnswerState>;
  /** Standings before this question, used to animate the scoreboard. */
  before: Map<string, Standing>;
  closed: boolean;
}

type RankedState = PlayerState & { rank: number };

const QUESTION_PHASES: ReadonlySet<SessionPhase> = new Set(['countdown', 'question', 'reveal', 'scoreboard']);

/**
 * One live quiz race. The server is the single source of truth: it owns timers, validates every
 * answer, scores on its own clock and never reveals the correct option before a question closes.
 */
export class LiveSession {
  readonly id: string;
  readonly pin: string;
  readonly ownerId: string;
  readonly quiz: Quiz;
  readonly createdAt = Date.now();

  private phaseValue: SessionPhase = 'lobby';
  private lockedValue = false;
  private lastActivity = Date.now();
  private readonly players = new Map<string, PlayerState>();
  private readonly playersByToken = new Map<string, PlayerState>();
  private joinCounter = 0;
  private questionIndex = -1;
  private countdownEndsAt = 0;
  private pendingBefore: Map<string, Standing> | null = null;
  private current: QuestionRun | null = null;
  private readonly runs: QuestionRun[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly listeners = new Set<(scope: ChangeScope) => void>();
  private startedAt: number | null = null;
  private endedAt: number | null = null;
  private reachedFinal = false;
  private persistQueue: Promise<void> = Promise.resolve();
  private rankingCache: RankedState[] | null = null;
  private readonly sink: ResultsSink;
  private readonly moderation: Moderation;
  private readonly maxPlayers: number;
  private readonly countdownMs: number;
  private readonly onError: (error: unknown) => void;

  constructor(options: LiveSessionOptions) {
    this.id = options.id;
    this.pin = options.pin;
    this.ownerId = options.ownerId;
    this.quiz = options.quiz;
    this.sink = options.sink;
    this.moderation = options.moderation;
    this.maxPlayers = options.maxPlayers ?? LIMITS.playersPerSessionMax;
    this.countdownMs = options.countdownMs ?? COUNTDOWN_MS;
    this.onError = options.onError ?? (() => undefined);
  }

  get phase(): SessionPhase {
    return this.phaseValue;
  }

  get locked(): boolean {
    return this.lockedValue;
  }

  get lastActivityAt(): number {
    return this.lastActivity;
  }

  get playerCount(): number {
    return this.activePlayers().length;
  }

  onChange(listener: (scope: ChangeScope) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---- Players ----------------------------------------------------------------

  addPlayer(input: { nickname: string; kart: Kart }): { playerId: string; token: string } {
    if (this.phaseValue === 'final' || this.phaseValue === 'ended') {
      throw new SessionError('ENDED', 'This race is already over.');
    }
    if (this.lockedValue) throw new SessionError('LOCKED', 'This race is locked. Ask the host to unlock it.');
    const active = this.activePlayers();
    if (active.length >= this.maxPlayers) throw new SessionError('FULL', 'This race is full.');
    if (this.moderation.isProfane(input.nickname)) {
      throw new SessionError('NAME_REJECTED', 'Please choose a different nickname.');
    }
    const key = nicknameKey(input.nickname);
    if (active.some((player) => player.key === key)) {
      throw new SessionError('NAME_TAKEN', 'That nickname is already taken in this race.');
    }

    const player: PlayerState = {
      id: randomUUID(),
      token: randomBytes(24).toString('base64url'),
      nickname: input.nickname,
      key,
      kart: { model: input.kart.model, color: input.kart.color },
      joinOrder: ++this.joinCounter,
      connected: true,
      kicked: false,
      score: 0,
      correctCount: 0,
      correctTimeMs: 0,
    };
    this.players.set(player.id, player);
    this.playersByToken.set(player.token, player);
    this.rankingCache = null;
    this.notify({ host: true, players: 'all' });
    return { playerId: player.id, token: player.token };
  }

  /** Resolves a returning device by its secret player token. */
  rejoin(token: string): { playerId: string } {
    const player = this.playersByToken.get(token);
    if (!player)
      throw new SessionError('NOT_FOUND', 'We could not find you in this race. Please join again.');
    if (player.kicked) throw new SessionError('KICKED', 'You were removed from this race by the host.');
    return { playerId: player.id };
  }

  setConnected(playerId: string, connected: boolean): void {
    const player = this.players.get(playerId);
    if (!player || player.kicked || player.connected === connected) return;
    player.connected = connected;
    this.notify({ host: true, players: [] });
    if (!connected) this.maybeAutoClose();
  }

  kick(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player || player.kicked) throw new SessionError('NOT_FOUND', 'Player not found.');
    player.kicked = true;
    player.connected = false;
    if (this.current && !this.current.closed) this.current.answers.delete(playerId);
    this.rankingCache = null;
    this.notify({ host: true, players: 'all' });
    this.maybeAutoClose();
  }

  setLocked(locked: boolean): void {
    if (this.phaseValue === 'ended') throw new SessionError('ENDED', 'This race is over.');
    this.lockedValue = locked;
    this.notify({ host: true, players: [] });
  }

  // ---- Race flow ----------------------------------------------------------------

  start(): void {
    if (this.phaseValue !== 'lobby') throw new SessionError('WRONG_PHASE', 'The race has already started.');
    if (this.quiz.questions.length === 0) throw new SessionError('INVALID', 'This quiz has no questions.');
    this.startedAt = Date.now();
    this.persistSession('live');
    this.beginCountdown(0);
  }

  /** The host's single "advance" action; also bound to the space bar on the big screen. */
  next(): void {
    switch (this.phaseValue) {
      case 'lobby':
        this.start();
        return;
      case 'countdown':
        return;
      case 'question':
        this.closeQuestion();
        return;
      case 'reveal':
        if (this.current?.question.type === 'mc') {
          this.phaseValue = 'scoreboard';
          this.notify({ host: true, players: 'all' });
        } else {
          this.advance();
        }
        return;
      case 'scoreboard':
        this.advance();
        return;
      case 'final':
        this.end();
        return;
      case 'ended':
        throw new SessionError('ENDED', 'This race is over.');
    }
  }

  endQuestion(): void {
    if (this.phaseValue !== 'question')
      throw new SessionError('WRONG_PHASE', 'No question is open right now.');
    this.closeQuestion();
  }

  end(): void {
    if (this.phaseValue === 'ended') return;
    this.clearTimer();
    const run = this.current;
    if (this.phaseValue === 'question' && run && !run.closed) {
      this.applyScores(run);
      this.persistAnswers(run);
    }
    this.phaseValue = 'ended';
    if (this.startedAt !== null) {
      this.endedAt ??= Date.now();
      this.persistSession(this.reachedFinal ? 'completed' : 'aborted');
    }
    this.notify({ host: true, players: 'all' });
  }

  submitAnswer(playerId: string, payload: AnswerPayload): void {
    const player = this.players.get(playerId);
    if (!player) throw new SessionError('NOT_FOUND', 'Join the race first.');
    if (player.kicked) throw new SessionError('KICKED', 'You were removed from this race by the host.');
    const run = this.current;
    const now = Date.now();
    if (
      this.phaseValue !== 'question' ||
      !run ||
      run.closed ||
      payload.questionIndex !== run.index ||
      now > run.deadline + ANSWER_GRACE_MS
    ) {
      throw new SessionError('TOO_LATE', 'Too late – this question is closed.');
    }
    if (run.answers.has(playerId)) throw new SessionError('ALREADY_ANSWERED', 'You already answered.');

    const responseMs = Math.min(Math.max(now - run.openedAt, 0), run.timeLimitMs);
    const question = run.question;
    let answer: AnswerState;
    if (question.type === 'mc') {
      const optionId = payload.optionId;
      if (!optionId || !question.options.some((option) => option.id === optionId)) {
        throw new SessionError('INVALID', 'Pick one of the answers.');
      }
      const correct = optionId === question.correctOptionId;
      answer = {
        playerId,
        optionId,
        text: null,
        responseMs,
        correct,
        points: calculatePoints(correct, responseMs, run.timeLimitMs),
        hidden: false,
      };
    } else {
      const parsed = openAnswerSchema.safeParse(payload.text ?? '');
      if (!parsed.success)
        throw new SessionError('INVALID', parsed.error.issues[0]?.message ?? 'Invalid answer.');
      answer = {
        playerId,
        optionId: null,
        text: this.moderation.censor(parsed.data),
        responseMs,
        correct: null,
        points: 0,
        hidden: false,
      };
    }
    run.answers.set(playerId, answer);
    this.notify({ host: true, players: [playerId] });
    this.maybeAutoClose();
  }

  hideAnswer(questionIndex: number, playerId: string, hidden: boolean): void {
    const run =
      this.current?.index === questionIndex ? this.current : this.runs.find((r) => r.index === questionIndex);
    const answer = run?.question.type === 'open' ? run.answers.get(playerId) : undefined;
    if (!run || !answer) throw new SessionError('NOT_FOUND', 'Answer not found.');
    answer.hidden = hidden;
    this.notify({ host: true, players: [] });
    if (run.closed) this.persistAnswers(run);
  }

  /** Resolves once all queued result writes have finished (used by tests and shutdown). */
  flush(): Promise<void> {
    return this.persistQueue;
  }

  dispose(): void {
    this.clearTimer();
    this.listeners.clear();
  }

  private beginCountdown(index: number): void {
    this.questionIndex = index;
    this.current = null;
    this.pendingBefore = this.standings();
    this.phaseValue = 'countdown';
    this.countdownEndsAt = Date.now() + this.countdownMs;
    this.schedule(this.countdownMs, () => this.openQuestion());
    this.notify({ host: true, players: 'all' });
  }

  private openQuestion(): void {
    const question = this.quiz.questions[this.questionIndex];
    if (!question) {
      this.finish();
      return;
    }
    const now = Date.now();
    const timeLimitMs = question.timeLimitSec * 1000;
    this.current = {
      index: this.questionIndex,
      question,
      timeLimitMs,
      openedAt: now,
      deadline: now + timeLimitMs,
      answers: new Map(),
      before: this.pendingBefore ?? this.standings(),
      closed: false,
    };
    this.phaseValue = 'question';
    this.schedule(timeLimitMs + ANSWER_GRACE_MS, () => this.closeQuestion());
    this.notify({ host: true, players: 'all' });
  }

  private maybeAutoClose(): void {
    const run = this.current;
    if (this.phaseValue !== 'question' || !run || run.closed) return;
    const connected = this.activePlayers().filter((player) => player.connected);
    if (connected.length > 0 && connected.every((player) => run.answers.has(player.id))) {
      this.closeQuestion();
    }
  }

  private closeQuestion(): void {
    const run = this.current;
    if (this.phaseValue !== 'question' || !run || run.closed) return;
    this.clearTimer();
    this.applyScores(run);
    this.phaseValue = 'reveal';
    this.notify({ host: true, players: 'all' });
    this.persistAnswers(run);
    this.persistSession('live');
  }

  private applyScores(run: QuestionRun): void {
    run.closed = true;
    for (const answer of run.answers.values()) {
      const player = this.players.get(answer.playerId);
      if (!player || player.kicked || !answer.correct) continue;
      player.score += answer.points;
      player.correctCount += 1;
      player.correctTimeMs += answer.responseMs;
    }
    this.runs.push(run);
    this.rankingCache = null;
  }

  private advance(): void {
    if (this.questionIndex + 1 < this.quiz.questions.length) this.beginCountdown(this.questionIndex + 1);
    else this.finish();
  }

  private finish(): void {
    this.clearTimer();
    this.phaseValue = 'final';
    this.reachedFinal = true;
    this.endedAt = Date.now();
    this.notify({ host: true, players: 'all' });
    this.persistSession('completed');
  }

  // ---- Views ----------------------------------------------------------------------

  hostView(): HostView {
    const ranks = this.rankMap();
    const active = this.activePlayers();
    const run = this.current;
    const revealing = (this.phaseValue === 'reveal' || this.phaseValue === 'scoreboard') && !!run?.closed;
    return {
      sessionId: this.id,
      pin: this.pin,
      quizTitle: this.quiz.title,
      phase: this.phaseValue,
      locked: this.lockedValue,
      questionIndex: this.questionIndex,
      questionCount: this.quiz.questions.length,
      playerCount: active.length,
      connectedCount: active.filter((player) => player.connected).length,
      players: this.phaseValue === 'lobby' ? active.map((player) => this.toPublic(player, ranks)) : [],
      question: this.currentQuestionPublic(),
      countdown: this.countdownInfo(),
      timer: this.timerInfo(),
      answeredCount: this.phaseValue === 'question' && run ? this.activeAnswers(run).length : 0,
      reveal: revealing && run ? this.revealData(run) : null,
      scoreboard: this.phaseValue === 'scoreboard' && run ? this.scoreboardData(run) : null,
      final: this.hasFinalStandings() ? this.finalData() : null,
    };
  }

  playerView(playerId: string): PlayerView | null {
    const player = this.players.get(playerId);
    if (!player || player.kicked) return null;
    const ranks = this.rankMap();
    const run = this.current && this.current.index === this.questionIndex ? this.current : null;
    const answer = run && QUESTION_PHASES.has(this.phaseValue) ? run.answers.get(playerId) : undefined;
    const revealing = (this.phaseValue === 'reveal' || this.phaseValue === 'scoreboard') && !!run?.closed;
    return {
      sessionId: this.id,
      pin: this.pin,
      quizTitle: this.quiz.title,
      phase: this.phaseValue,
      questionIndex: this.questionIndex,
      questionCount: this.quiz.questions.length,
      playerCount: this.activePlayers().length,
      me: {
        id: player.id,
        nickname: player.nickname,
        kart: player.kart,
        score: player.score,
        rank: ranks.get(player.id) ?? 0,
      },
      question: this.currentQuestionPublic(),
      countdown: this.countdownInfo(),
      timer: this.timerInfo(),
      myAnswer: answer ? { optionId: answer.optionId, text: answer.text } : null,
      result: revealing && run ? this.playerResult(run, player) : null,
      final: this.hasFinalStandings() ? this.playerFinal(player) : null,
    };
  }

  summary(): LiveSessionSummary {
    return {
      sessionId: this.id,
      pin: this.pin,
      quizId: this.quiz.id,
      quizTitle: this.quiz.title,
      phase: this.phaseValue,
      playerCount: this.activePlayers().length,
      createdAt: new Date(this.createdAt).toISOString(),
    };
  }

  joinInfo(): JoinInfo {
    const over = this.phaseValue === 'final' || this.phaseValue === 'ended';
    return {
      sessionId: this.id,
      quizTitle: this.quiz.title,
      phase: this.phaseValue,
      locked: this.lockedValue,
      joinable: !over && !this.lockedValue && this.activePlayers().length < this.maxPlayers,
    };
  }

  toSessionRecord(status: SessionStatus): SessionRecord {
    return {
      id: this.id,
      ownerId: this.ownerId,
      quizId: this.quiz.id,
      quizTitle: this.quiz.title,
      pin: this.pin,
      status,
      startedAt: new Date(this.startedAt ?? this.createdAt).toISOString(),
      endedAt: this.endedAt === null ? null : new Date(this.endedAt).toISOString(),
      questions: structuredClone(this.quiz.questions),
      players: this.ranking().map((player) => this.toRanked(player)),
      questionStats: this.runs.map((run) => this.questionStat(run)),
    };
  }

  private activePlayers(): PlayerState[] {
    return [...this.players.values()].filter((player) => !player.kicked);
  }

  private activeAnswers(run: QuestionRun): AnswerState[] {
    return [...run.answers.values()].filter((answer) => {
      const player = this.players.get(answer.playerId);
      return !!player && !player.kicked;
    });
  }

  private ranking(): RankedState[] {
    this.rankingCache ??= rankPlayers(this.activePlayers());
    return this.rankingCache;
  }

  private rankMap(): Map<string, number> {
    return new Map(this.ranking().map((player) => [player.id, player.rank]));
  }

  private standings(): Map<string, Standing> {
    return new Map(this.ranking().map((player) => [player.id, { score: player.score, rank: player.rank }]));
  }

  private hasFinalStandings(): boolean {
    return this.phaseValue === 'final' || (this.phaseValue === 'ended' && this.startedAt !== null);
  }

  private currentQuestionPublic(): QuestionPublic | null {
    if (!QUESTION_PHASES.has(this.phaseValue)) return null;
    const question = this.quiz.questions[this.questionIndex];
    if (!question) return null;
    return {
      index: this.questionIndex,
      id: question.id,
      type: question.type,
      text: question.text,
      options: question.type === 'mc' ? question.options.map((option) => ({ ...option })) : null,
      timeLimitSec: question.timeLimitSec,
    };
  }

  private countdownInfo(): TimerInfo | null {
    if (this.phaseValue !== 'countdown') return null;
    return { remainingMs: Math.max(0, this.countdownEndsAt - Date.now()), totalMs: this.countdownMs };
  }

  private timerInfo(): TimerInfo | null {
    const run = this.current;
    if (this.phaseValue !== 'question' || !run) return null;
    return { remainingMs: Math.max(0, run.deadline - Date.now()), totalMs: run.timeLimitMs };
  }

  private toPublic(player: PlayerState, ranks: Map<string, number>): PlayerPublic {
    return {
      id: player.id,
      nickname: player.nickname,
      kart: player.kart,
      score: player.score,
      correctCount: player.correctCount,
      rank: ranks.get(player.id) ?? 0,
      connected: player.connected,
    };
  }

  private toRanked(player: RankedState): RankedPlayer {
    return {
      playerId: player.id,
      nickname: player.nickname,
      kart: player.kart,
      score: player.score,
      correctCount: player.correctCount,
      rank: player.rank,
    };
  }

  private revealData(run: QuestionRun): RevealData {
    const answers = this.activeAnswers(run);
    const playerCount = this.activePlayers().length;
    const question = run.question;
    if (question.type === 'mc') {
      const total = answers.reduce((sum, answer) => sum + answer.responseMs, 0);
      return {
        type: 'mc',
        correctOptionId: question.correctOptionId,
        distribution: question.options.map((option) => ({
          optionId: option.id,
          count: answers.filter((answer) => answer.optionId === option.id).length,
        })),
        answeredCount: answers.length,
        correctCount: answers.filter((answer) => answer.correct).length,
        playerCount,
        avgResponseMs: answers.length > 0 ? Math.round(total / answers.length) : null,
      };
    }
    return {
      type: 'open',
      answers: answers
        .sort((a, b) => a.responseMs - b.responseMs)
        .map((answer) => {
          const player = this.players.get(answer.playerId);
          return {
            playerId: answer.playerId,
            nickname: player?.nickname ?? '?',
            kart: player?.kart ?? { model: 'classic', color: 'red' },
            text: answer.text ?? '',
            hidden: answer.hidden,
          };
        }),
      answeredCount: answers.length,
      playerCount,
    };
  }

  private scoreboardData(run: QuestionRun): ScoreboardData {
    const ranking = this.ranking();
    // Before anyone has points, ranks only reflect join order, so there is no "previous" position.
    const hadScores = [...run.before.values()].some((standing) => standing.score > 0);
    return {
      entries: ranking.slice(0, SCOREBOARD_SIZE).map((player) => {
        const before = run.before.get(player.id);
        return {
          playerId: player.id,
          nickname: player.nickname,
          kart: player.kart,
          score: player.score,
          previousScore: before?.score ?? 0,
          rank: player.rank,
          previousRank: hadScores ? (before?.rank ?? null) : null,
          lastPoints: run.answers.get(player.id)?.points ?? 0,
        };
      }),
      leaderScore: ranking[0]?.score ?? 0,
      totalPlayers: ranking.length,
    };
  }

  private finalData(): FinalData {
    const ranking = this.ranking();
    return { ranking: ranking.map((player) => this.toRanked(player)), totalPlayers: ranking.length };
  }

  private playerResult(run: QuestionRun, player: PlayerState): PlayerResult {
    const answer = run.answers.get(player.id);
    const ranking = this.ranking();
    const index = ranking.findIndex((ranked) => ranked.id === player.id);
    const ahead = index > 0 ? ranking[index - 1] : undefined;
    const question = run.question;
    return {
      questionIndex: run.index,
      type: question.type,
      answered: !!answer,
      correct: question.type === 'mc' ? (answer?.correct ?? false) : null,
      points: answer?.points ?? 0,
      myAnswer: answer ? { optionId: answer.optionId, text: answer.text } : null,
      correctOption:
        question.type === 'mc'
          ? (question.options.find((option) => option.id === question.correctOptionId) ?? null)
          : null,
      totalScore: player.score,
      rank: index + 1,
      gapToNext: ahead ? ahead.score - player.score : null,
      nextNickname: ahead?.nickname ?? null,
    };
  }

  private playerFinal(player: PlayerState): PlayerFinal {
    const ranking = this.ranking();
    return {
      rank: ranking.findIndex((ranked) => ranked.id === player.id) + 1,
      score: player.score,
      correctCount: player.correctCount,
      totalPlayers: ranking.length,
      podium: ranking.slice(0, PODIUM_SIZE).map((ranked) => this.toRanked(ranked)),
    };
  }

  private questionStat(run: QuestionRun): QuestionStat {
    const reveal = this.revealData(run);
    const answers = this.activeAnswers(run);
    const total = answers.reduce((sum, answer) => sum + answer.responseMs, 0);
    return {
      questionIndex: run.index,
      questionId: run.question.id,
      type: run.question.type,
      answeredCount: answers.length,
      correctCount: reveal.type === 'mc' ? reveal.correctCount : null,
      distribution: reveal.type === 'mc' ? reveal.distribution : null,
      avgResponseMs: answers.length > 0 ? Math.round(total / answers.length) : null,
    };
  }

  private toAnswersRecord(run: QuestionRun): QuestionAnswersRecord {
    return {
      id: `${this.id}_${run.index}`,
      sessionId: this.id,
      questionIndex: run.index,
      questionId: run.question.id,
      answers: this.activeAnswers(run).map((answer) => ({
        playerId: answer.playerId,
        nickname: this.players.get(answer.playerId)?.nickname ?? '?',
        optionId: answer.optionId,
        text: answer.text,
        responseMs: answer.responseMs,
        correct: answer.correct,
        points: answer.points,
        hidden: answer.hidden,
      })),
    };
  }

  // ---- Plumbing ---------------------------------------------------------------------

  private persistSession(status: SessionStatus): void {
    const record = this.toSessionRecord(status);
    this.enqueue(() => this.sink.saveSession(record));
  }

  private persistAnswers(run: QuestionRun): void {
    const record = this.toAnswersRecord(run);
    this.enqueue(() => this.sink.saveQuestionAnswers(record));
  }

  /** Writes are serialised so a slow early write can never overwrite a later one. */
  private enqueue(task: () => Promise<void>): void {
    this.persistQueue = this.persistQueue.then(task).catch((error: unknown) => this.onError(error));
  }

  private notify(scope: ChangeScope): void {
    this.lastActivity = Date.now();
    for (const listener of this.listeners) {
      try {
        listener(scope);
      } catch (error) {
        this.onError(error);
      }
    }
  }

  private schedule(delayMs: number, task: () => void): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        task();
      } catch (error) {
        this.onError(error);
      }
    }, delayMs);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
