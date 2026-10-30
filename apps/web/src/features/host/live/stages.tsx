import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type {
  HostView,
  McReveal,
  OpenReveal,
  PlayerPublic,
  QuestionPublic,
  RankedPlayer,
} from '@power-quiz/shared';
import { answerStyle } from '../../../design/answers';
import { Notice } from '../../../design/Panel';
import { Icon, Kart } from '../../../design/sprites/Sprites';
import { Confetti, TimerBar, TrafficLight, lightStateFor } from '../../../design/Widgets';
import { cx } from '../../../lib/cx';
import { formatPin, formatPoints, formatSeconds, percent } from '../../../lib/format';
import { useRemainingMs, type Timed } from '../../../lib/socket';
import { useSound } from '../../../sound/useSound';

export function joinUrl(pin: string): string {
  return `${window.location.origin}/join/${pin}`;
}

// ---- Lobby ------------------------------------------------------------------------

/** Bigger karts while the grid is small, compact tiles once the room fills up. */
function lobbyGridSize(count: number) {
  if (count <= 8)
    return { scale: 5, text: 'text-2xl', columns: 'grid-cols-[repeat(auto-fill,minmax(210px,1fr))]' };
  if (count <= 30)
    return { scale: 3, text: 'text-lg', columns: 'grid-cols-[repeat(auto-fill,minmax(150px,1fr))]' };
  return { scale: 2, text: 'text-base', columns: 'grid-cols-[repeat(auto-fill,minmax(112px,1fr))]' };
}

export function LobbyStage({ view, onKick }: { view: HostView; onKick: (player: PlayerPublic) => void }) {
  const gridSize = lobbyGridSize(view.players.length);
  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[minmax(340px,2fr)_3fr]">
      <section className="px-frame m-1 flex flex-col items-center justify-center gap-3 bg-night-800 p-6 text-center">
        <p className="font-pixel text-sm text-mist">Scan to join the race</p>
        <div className="px-frame m-1 bg-white p-4">
          <QRCodeSVG
            value={joinUrl(view.pin)}
            size={512}
            level="M"
            marginSize={0}
            fgColor="#120a24"
            bgColor="#ffffff"
            title="QR code to join the race"
            className="h-auto w-[min(36vh,28vw)] min-w-44"
          />
        </div>
        <p className="text-xl text-mist">
          or open <strong className="text-white">{window.location.host}/join</strong>
        </p>
        <p className="mt-2 font-pixel text-sm text-mist">Race PIN</p>
        <p
          className="px-text-outline font-pixel text-5xl tracking-wider text-sun xl:text-7xl"
          data-testid="race-pin"
        >
          {formatPin(view.pin)}
        </p>
      </section>

      <section className="px-frame m-1 flex min-h-0 flex-col bg-night-800 p-4">
        <header className="mb-3 flex items-center justify-between gap-4">
          <h2 className="font-pixel text-base text-sun">Starting grid</h2>
          <span className="font-pixel text-sm" data-testid="racer-count">
            {view.playerCount} {view.playerCount === 1 ? 'racer' : 'racers'}
          </span>
        </header>
        {view.locked && <Notice className="mb-3">Race locked – nobody new can join.</Notice>}
        {view.players.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 text-mist">
            <div className="animate-bob">
              <Kart kart={{ model: 'classic', color: 'yellow' }} scale={7} title={false} />
            </div>
            <p className="animate-blink font-pixel text-lg">Waiting for racers…</p>
          </div>
        ) : (
          <ul className={cx('grid min-h-0 flex-1 auto-rows-min gap-3 overflow-y-auto p-1', gridSize.columns)}>
            {view.players.map((player, index) => (
              <li
                key={player.id}
                className={cx(
                  'group relative flex animate-pop flex-col items-center gap-1 bg-night-950/70 px-2 pb-2 pt-4',
                  !player.connected && 'opacity-40',
                )}
              >
                <span className="absolute left-1.5 top-1.5 font-pixel text-[8px] text-mist">{index + 1}</span>
                <Kart kart={player.kart} scale={gridSize.scale} title={false} />
                <span className={cx('w-full truncate text-center font-bold', gridSize.text)}>
                  {player.nickname}
                </span>
                <button
                  type="button"
                  onClick={() => onKick(player)}
                  aria-label={`Remove ${player.nickname}`}
                  title={`Remove ${player.nickname}`}
                  className="absolute right-1 top-1 bg-flame p-1 opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
                >
                  <Icon name="cross" size={1.2} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---- Countdown & question ----------------------------------------------------------

export function CountdownStage({ timed }: { timed: Timed<HostView> }) {
  const { view } = timed;
  const remaining = useRemainingMs(view.countdown, timed.receivedAt);
  const state = lightStateFor(remaining);
  const { play } = useSound();
  useEffect(() => {
    play(state === 'go' ? 'go' : 'countdownTick');
  }, [state, play]);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 text-center">
      <p className="font-pixel text-lg text-mist">
        Question {view.questionIndex + 1} of {view.questionCount}
      </p>
      <TrafficLight state={state} />
      {view.question && (
        <h2 className="max-w-6xl text-4xl font-bold leading-tight xl:text-6xl">{view.question.text}</h2>
      )}
    </div>
  );
}

export function AnswerGrid({ question, reveal }: { question: QuestionPublic; reveal?: McReveal }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {question.options?.map((option, index) => {
        const style = answerStyle(index);
        const correct = reveal?.correctOptionId === option.id;
        return (
          <div
            key={option.id}
            data-correct={reveal ? correct : undefined}
            className={cx(
              'px-frame-raised m-1 flex min-h-16 items-center gap-4 px-5 py-3 text-2xl font-bold xl:min-h-20 xl:text-3xl',
              style.className,
              reveal && !correct && 'opacity-30',
              correct && 'px-glow animate-pop',
            )}
          >
            <Icon name={style.icon} size={3.5} />
            <span className="flex-1 break-words">{option.text}</span>
            {correct && <Icon name="check" size={4} title="Correct answer" />}
          </div>
        );
      })}
    </div>
  );
}

export function QuestionStage({ timed }: { timed: Timed<HostView> }) {
  const { view } = timed;
  const remaining = useRemainingMs(view.timer, timed.receivedAt);
  const question = view.question;
  if (!question) return null;
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-4">
        <span className="whitespace-nowrap font-pixel text-sm text-mist">
          Q {view.questionIndex + 1}/{view.questionCount}
        </span>
        {view.timer && <TimerBar remainingMs={remaining} totalMs={view.timer.totalMs} className="flex-1" />}
      </div>
      <h2 className="px-frame m-1 bg-white p-5 text-center text-3xl font-bold leading-tight text-ink xl:p-8 xl:text-5xl">
        {question.text}
      </h2>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="px-frame m-1 flex flex-col items-center gap-2 bg-night-800 px-12 py-6 text-center">
          <span className="font-pixel text-6xl text-sun" data-testid="answered-count">
            {view.answeredCount}
          </span>
          <span className="font-pixel text-xs text-mist">of {view.connectedCount} answered</span>
        </div>
      </div>
      {question.type === 'mc' ? (
        <AnswerGrid question={question} />
      ) : (
        <p className="animate-blink pb-4 text-center font-pixel text-xl text-sun">
          Type your answer on your phone!
        </p>
      )}
    </div>
  );
}

// ---- Reveal ---------------------------------------------------------------------------

function OpenAnswerWall({
  view,
  reveal,
  onHide,
}: {
  view: HostView;
  reveal: OpenReveal;
  onHide: (playerId: string, hidden: boolean) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-3xl font-bold leading-tight xl:text-4xl">{view.question?.text}</h2>
        <span className="whitespace-nowrap font-pixel text-sm text-mist">
          {reveal.answeredCount} of {reveal.playerCount} answered
        </span>
      </div>
      {reveal.answers.length === 0 ? (
        <p className="m-auto font-pixel text-lg text-mist">No answers this time</p>
      ) : (
        <ul className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3 overflow-y-auto p-1">
          {reveal.answers.map((answer, index) => (
            <li
              key={answer.playerId}
              className="group px-frame m-1 animate-pop bg-white p-4 text-ink"
              style={{ animationDelay: `${Math.min(index, 24) * 70}ms` }}
            >
              <div className="flex items-center gap-2">
                <Kart kart={answer.kart} scale={2} title={false} />
                <span className="flex-1 truncate text-lg font-bold">{answer.nickname}</span>
                <button
                  type="button"
                  onClick={() => onHide(answer.playerId, !answer.hidden)}
                  aria-label={
                    answer.hidden
                      ? `Show answer from ${answer.nickname}`
                      : `Hide answer from ${answer.nickname}`
                  }
                  title={answer.hidden ? 'Show answer' : 'Hide answer'}
                  className="p-1 text-ink/50 opacity-0 transition-opacity hover:text-ink focus:opacity-100 group-hover:opacity-100"
                >
                  <Icon name={answer.hidden ? 'eye' : 'eyeOff'} size={2} />
                </button>
              </div>
              <p className="mt-2 break-words text-3xl font-bold leading-snug">
                {answer.hidden ? (
                  <span className="text-lg italic text-ink/40">Hidden by host</span>
                ) : (
                  answer.text
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RevealStage({
  view,
  onHide,
}: {
  view: HostView;
  onHide: (playerId: string, hidden: boolean) => void;
}) {
  const reveal = view.reveal;
  const question = view.question;
  if (!reveal || !question) return null;
  if (reveal.type === 'open') return <OpenAnswerWall view={view} reveal={reveal} onHide={onHide} />;

  const max = Math.max(1, ...reveal.distribution.map((entry) => entry.count));
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <h2 className="text-center text-2xl font-bold leading-tight xl:text-4xl">{question.text}</h2>
      <div className="flex min-h-0 flex-1 items-end justify-center gap-[3vw] px-6">
        {question.options?.map((option, index) => {
          const count = reveal.distribution.find((entry) => entry.optionId === option.id)?.count ?? 0;
          const style = answerStyle(index);
          const correct = option.id === reveal.correctOptionId;
          return (
            <div key={option.id} className="flex w-[clamp(90px,12vw,190px)] flex-col items-center gap-2">
              <span className="font-pixel text-2xl">{count}</span>
              <div className="flex h-[26vh] w-full items-end">
                <div
                  className={cx('px-frame m-1 w-full origin-bottom animate-rise', !correct && 'opacity-40')}
                  style={{ height: `${Math.max(3, (count / max) * 100)}%`, backgroundColor: style.barColor }}
                />
              </div>
              <div className={cx('flex h-12 w-full items-center justify-center gap-2', style.className)}>
                <Icon name={style.icon} size={2.6} />
                {correct && <Icon name="check" size={2.6} />}
              </div>
            </div>
          );
        })}
      </div>
      <AnswerGrid question={question} reveal={reveal} />
      <p className="flex flex-wrap justify-center gap-x-8 gap-y-1 pb-1 text-xl text-mist">
        <span>
          <strong className="text-white">{percent(reveal.correctCount, reveal.answeredCount)}%</strong>{' '}
          correct
        </span>
        <span>
          <strong className="text-white">{reveal.answeredCount}</strong> of {reveal.playerCount} answered
        </span>
        {reveal.avgResponseMs !== null && (
          <span>
            avg <strong className="text-white">{formatSeconds(reveal.avgResponseMs)}</strong>
          </span>
        )}
      </p>
    </div>
  );
}

// ---- Scoreboard ------------------------------------------------------------------------

export function ScoreboardStage({ view }: { view: HostView }) {
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setMoved(true), 200);
    return () => window.clearTimeout(timer);
  }, []);
  const board = view.scoreboard;
  if (!board) return null;
  const max = Math.max(1, board.leaderScore);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 className="px-text-outline font-pixel text-2xl text-sun xl:text-3xl">Standings</h2>
        <span className="font-pixel text-sm text-mist">
          after question {view.questionIndex + 1} of {view.questionCount}
        </span>
      </div>
      <ol className="flex min-h-0 flex-1 flex-col justify-center gap-3">
        {board.entries.map((entry) => {
          const progress = (moved ? entry.score : entry.previousScore) / max;
          const climbed = entry.previousRank !== null && entry.previousRank > entry.rank;
          return (
            <li key={entry.playerId} className="flex items-center gap-4" data-testid="standing">
              <span className="w-12 text-right font-pixel text-3xl text-sun">{entry.rank}</span>
              <div className="relative h-[clamp(64px,12vh,112px)] flex-1 overflow-hidden border-y-4 border-ink bg-[#3a3550]">
                <div className="px-road absolute inset-x-0 top-1/2 h-1 opacity-50" />
                <div className="px-checkered absolute inset-y-0 right-0 w-6" />
                <div
                  className="absolute bottom-1 transition-[left] duration-[1800ms] ease-out"
                  style={{ left: `calc(${progress} * (100% - 130px))` }}
                >
                  <Kart kart={entry.kart} scale={4} title={false} />
                </div>
              </div>
              <div className="w-[clamp(180px,22vw,320px)]">
                <p className="flex items-center gap-2 truncate text-2xl font-bold">
                  <span className="truncate">{entry.nickname}</span>
                  {climbed && (
                    <Icon name="arrowUp" size={1.8} className="shrink-0 text-lime" title="Moved up" />
                  )}
                </p>
                <p className="font-pixel text-sm">
                  {formatPoints(entry.score)}
                  {entry.lastPoints > 0 && (
                    <span className="ml-3 inline-block animate-pop text-lime">
                      +{formatPoints(entry.lastPoints)}
                    </span>
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {board.totalPlayers > board.entries.length && (
        <p className="text-center text-lg text-mist">
          + {board.totalPlayers - board.entries.length} more racers chasing the leaders
        </p>
      )}
    </div>
  );
}

// ---- Final ---------------------------------------------------------------------------------

const PODIUM = {
  1: { height: 'h-[30vh]', color: 'bg-sun text-ink', delay: 1.6, scale: 6 },
  2: { height: 'h-[21vh]', color: 'bg-[#c9cfe0] text-ink', delay: 0.8, scale: 5 },
  3: { height: 'h-[14vh]', color: 'bg-[#d98e04] text-ink', delay: 0, scale: 5 },
} as const;

function PodiumStep({ player, place }: { player: RankedPlayer | undefined; place: 1 | 2 | 3 }) {
  const step = PODIUM[place];
  if (!player) return <div className="w-[clamp(140px,15vw,230px)]" />;
  return (
    <div
      className="flex w-[clamp(140px,15vw,230px)] animate-rise flex-col items-center gap-2"
      style={{ animationDelay: `${step.delay}s` }}
      data-testid={`podium-${place}`}
    >
      {place === 1 && <Icon name="crown" size={5} className="animate-bob text-sun" title="Winner" />}
      <Kart kart={player.kart} scale={step.scale} title={false} />
      <p className="w-full truncate text-center text-2xl font-bold">{player.nickname}</p>
      <p className="font-pixel text-sm text-sun">{formatPoints(player.score)}</p>
      <div
        className={cx(
          'px-frame m-1 flex w-full justify-center pt-4 font-pixel text-5xl',
          step.height,
          step.color,
        )}
      >
        {place}
      </div>
    </div>
  );
}

export function FinalStage({ view }: { view: HostView }) {
  const final = view.final;
  if (!final) return null;
  const [first, second, third] = final.ranking;
  return (
    <div className="grid h-full min-h-0 gap-6 xl:grid-cols-[3fr_2fr]">
      <Confetti />
      <section className="flex flex-col items-center justify-end gap-4">
        <div className="flex animate-pop items-center gap-4">
          <Icon name="trophy" size={6} className="text-sun" />
          <h2 className="px-text-outline font-pixel text-3xl text-sun xl:text-5xl">Podium</h2>
          <Icon name="trophy" size={6} className="text-sun" />
        </div>
        <div className="flex items-end justify-center gap-4">
          <PodiumStep player={second} place={2} />
          <PodiumStep player={first} place={1} />
          <PodiumStep player={third} place={3} />
        </div>
      </section>
      <section
        className="px-frame m-1 flex min-h-0 animate-rise flex-col bg-night-800 p-4"
        style={{ animationDelay: '2.6s' }}
        aria-label="Hitlist"
      >
        <h3 className="mb-3 font-pixel text-sm text-sun">Hitlist · {final.totalPlayers} racers</h3>
        <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {final.ranking.map((player) => (
            <li
              key={player.playerId}
              className={cx(
                'flex items-center gap-3 px-3 py-1.5',
                player.rank === 1 ? 'bg-sun text-ink' : player.rank <= 3 ? 'bg-night-600' : 'bg-night-950/70',
              )}
            >
              <span className="w-9 font-pixel text-xs">{player.rank}.</span>
              <Kart kart={player.kart} scale={1.5} title={false} />
              <span className="flex-1 truncate text-lg font-bold">{player.nickname}</span>
              <span className="text-sm opacity-80">{player.correctCount} correct</span>
              <span className="w-24 text-right font-pixel text-xs">{formatPoints(player.score)}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
