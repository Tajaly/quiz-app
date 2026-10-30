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
import { RaceScene, StartingLine } from '../../../design/Scenery';
import { DogReferee, Icon, Kart } from '../../../design/sprites/Sprites';
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
    <div className="grid min-h-0 gap-5 lg:h-full lg:grid-cols-[minmax(340px,2fr)_3fr]">
      <section className="game-panel flex flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="font-display text-3xl font-bold text-ink">Scan to join the race</h1>
        <div className="rounded-2xl bg-surface p-4">
          <QRCodeSVG
            value={joinUrl(view.pin)}
            size={512}
            level="M"
            marginSize={0}
            fgColor="#19354d"
            bgColor="#ffffff"
            title="QR code to join the race"
            className="h-auto w-[min(34vh,28vw)] min-w-36 max-w-full"
          />
        </div>
        <p className="max-w-full break-words text-base text-mist">
          or open <strong className="text-sky-dark">{window.location.host}/join</strong>
        </p>
        <p className="mt-2 font-pixel text-sm text-mist">Race PIN</p>
        <p
          className="max-w-full rounded-xl bg-sun-soft px-3 py-4 font-pixel text-[clamp(1.7rem,4vw,4.2rem)] text-ink"
          data-testid="race-pin"
        >
          {formatPin(view.pin)}
        </p>
      </section>

      <section className="game-panel flex min-h-72 min-w-0 flex-col p-5 lg:min-h-0">
        <header className="mb-3 flex items-center justify-between gap-4">
          <h2 className="font-display text-3xl font-bold">Starting grid</h2>
          <span
            className="shrink-0 rounded-full bg-lime-soft px-3 py-2 text-sm font-bold text-leaf"
            data-testid="racer-count"
          >
            {view.playerCount} {view.playerCount === 1 ? 'racer' : 'racers'}
          </span>
        </header>
        {view.locked && <Notice className="mb-3">Race locked – nobody new can join.</Notice>}
        {view.players.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-4 text-mist">
            <RaceScene className="max-w-xl" />
            <p className="text-xl font-semibold">Waiting for racers…</p>
          </div>
        ) : (
          <ul className={cx('grid min-h-0 flex-1 auto-rows-min gap-3 overflow-y-auto p-1', gridSize.columns)}>
            {view.players.map((player, index) => (
              <li
                key={player.id}
                className={cx(
                  'racer-bay group relative flex animate-pop flex-col items-center gap-2 px-3 pb-3 pt-8',
                  !player.connected && 'opacity-40',
                )}
              >
                <span className="absolute left-2 top-2 rounded-full bg-white px-2 py-1 text-xs font-bold text-sky">
                  {index + 1}
                </span>
                <Kart kart={player.kart} scale={gridSize.scale} title={false} />
                <span className={cx('w-full truncate text-center font-bold', gridSize.text)}>
                  {player.nickname}
                </span>
                <button
                  type="button"
                  onClick={() => onKick(player)}
                  aria-label={`Remove ${player.nickname}`}
                  title={`Remove ${player.nickname}`}
                  className="absolute right-1 top-1 flex min-h-9 min-w-9 items-center justify-center rounded-lg bg-flame-soft p-2 text-flame-dark opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
                >
                  <Icon name="cross" size={1.2} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <StartingLine className="mt-4 shrink-0 rounded-sm opacity-20" />
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
      <div className="flex max-w-full flex-wrap items-center justify-center gap-4">
        <DogReferee className="w-20 sm:w-28" />
        <p className="font-pixel text-lg text-mist">
          Question {view.questionIndex + 1} of {view.questionCount}
        </p>
      </div>
      <TrafficLight state={state} />
      {view.question && (
        <h2 className="max-w-6xl text-4xl font-bold leading-tight xl:text-6xl">{view.question.text}</h2>
      )}
    </div>
  );
}

export function AnswerGrid({ question, reveal }: { question: QuestionPublic; reveal?: McReveal }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              reveal && !correct && 'saturate-50',
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
      <h2 className="game-panel p-5 text-center text-3xl font-bold leading-tight text-ink xl:p-8 xl:text-5xl">
        {question.text}
      </h2>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3 px-8 py-6 text-center">
          <span className="font-display text-8xl font-bold text-sky-dark" data-testid="answered-count">
            {view.answeredCount}
          </span>
          <span className="font-pixel text-xs text-mist">of {view.connectedCount} answered</span>
        </div>
      </div>
      {question.type === 'mc' ? (
        <AnswerGrid question={question} />
      ) : (
        <p className="pb-4 text-center text-xl font-bold text-sky-dark">Type your answer on your phone!</p>
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
        <ul className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-3 overflow-y-auto p-1">
          {reveal.answers.map((answer, index) => (
            <li
              key={answer.playerId}
              className="group game-panel animate-pop p-4 text-ink"
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
                  className="rounded-lg p-2 text-mist transition-colors hover:bg-sky-soft hover:text-ink"
                >
                  <Icon name={answer.hidden ? 'eye' : 'eyeOff'} size={2} />
                </button>
              </div>
              <p className="mt-2 break-words text-3xl font-bold leading-snug">
                {answer.hidden ? (
                  <span className="text-lg italic text-mist">Hidden by host</span>
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
      <div className="flex min-h-0 flex-1 items-end justify-center gap-[3vw] px-2 sm:px-6">
        {question.options?.map((option, index) => {
          const count = reveal.distribution.find((entry) => entry.optionId === option.id)?.count ?? 0;
          const style = answerStyle(index);
          const correct = option.id === reveal.correctOptionId;
          return (
            <div
              key={option.id}
              className="flex w-[clamp(44px,12vw,190px)] min-w-0 flex-col items-center gap-2"
            >
              <span className="font-pixel text-2xl">{count}</span>
              <div className="flex h-[26vh] w-full items-end">
                <div
                  className={cx('px-frame m-1 w-full origin-bottom animate-rise', !correct && 'opacity-40')}
                  style={{ height: `${Math.max(3, (count / max) * 100)}%`, backgroundColor: style.barColor }}
                />
              </div>
              <div
                className={cx(
                  'flex h-12 w-full items-center justify-center gap-1 rounded-lg',
                  style.className,
                )}
              >
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
          <strong className="text-ink">{percent(reveal.correctCount, reveal.answeredCount)}%</strong> correct
        </span>
        <span>
          <strong className="text-ink">{reveal.answeredCount}</strong> of {reveal.playerCount} answered
        </span>
        {reveal.avgResponseMs !== null && (
          <span>
            avg <strong className="text-ink">{formatSeconds(reveal.avgResponseMs)}</strong>
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
        <h2 className="font-display text-4xl font-bold text-ink xl:text-5xl">Standings</h2>
        <span className="font-pixel text-sm text-mist">
          after question {view.questionIndex + 1} of {view.questionCount}
        </span>
      </div>
      <ol className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-2">
        {board.entries.map((entry) => {
          const progress = (moved ? entry.score : entry.previousScore) / max;
          const climbed = entry.previousRank !== null && entry.previousRank > entry.rank;
          return (
            <li
              key={entry.playerId}
              className="grid shrink-0 grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 sm:grid-cols-[3rem_minmax(0,1fr)_minmax(150px,22%)] sm:gap-x-4"
              data-testid="standing"
            >
              <span className="text-right font-display text-4xl font-bold text-sun-dark">{entry.rank}</span>
              <div className="score-lane h-[clamp(64px,12vh,112px)]">
                <div className="px-road absolute inset-x-0 top-1/2 h-1 opacity-50" />
                <div className="px-checkered absolute inset-y-0 right-0 w-6" />
                <div
                  className="absolute bottom-1 transition-[left] duration-[1800ms] ease-out"
                  style={{ left: `calc(${progress} * (100% - 130px))` }}
                >
                  <Kart kart={entry.kart} scale={4} title={false} />
                </div>
              </div>
              <div className="col-start-2 min-w-0 sm:col-start-auto">
                <p className="flex items-center gap-2 truncate text-2xl font-bold">
                  <span className="truncate">{entry.nickname}</span>
                  {climbed && (
                    <Icon name="arrowUp" size={1.8} className="shrink-0 text-leaf" title="Moved up" />
                  )}
                </p>
                <p className="font-pixel text-sm">
                  {formatPoints(entry.score)}
                  {entry.lastPoints > 0 && (
                    <span className="ml-3 inline-block animate-pop text-leaf">
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
  2: { height: 'h-[21vh]', color: 'bg-[#d4e4ee] text-ink', delay: 0.8, scale: 5 },
  3: { height: 'h-[14vh]', color: 'bg-[#f3c3a4] text-ink', delay: 0, scale: 5 },
} as const;

function PodiumStep({ player, place }: { player: RankedPlayer | undefined; place: 1 | 2 | 3 }) {
  const step = PODIUM[place];
  if (!player) return <div className="w-[clamp(76px,15vw,230px)]" />;
  return (
    <div
      className="flex w-[clamp(76px,15vw,230px)] animate-rise flex-col items-center gap-2"
      style={{ animationDelay: `${step.delay}s` }}
      data-testid={`podium-${place}`}
    >
      {place === 1 && <Icon name="crown" size={5} className="animate-bob text-sun" title="Winner" />}
      <Kart kart={player.kart} scale={step.scale} className="h-auto max-w-full" title={false} />
      <p className="w-full truncate text-center text-base font-bold sm:text-2xl">{player.nickname}</p>
      <p className="font-pixel text-[10px] text-sun-dark sm:text-sm">{formatPoints(player.score)}</p>
      <div
        className={cx(
          'podium-block flex w-full justify-center pt-4 font-display text-6xl font-bold',
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
          <Icon name="trophy" size={6} className="hidden text-sun sm:block" />
          <h2 className="font-display text-5xl font-bold text-ink xl:text-7xl">Podium</h2>
          <DogReferee pose="finish" className="w-20 sm:w-28" />
        </div>
        <div className="flex items-end justify-center gap-2 sm:gap-4">
          <PodiumStep player={second} place={2} />
          <PodiumStep player={first} place={1} />
          <PodiumStep player={third} place={3} />
        </div>
      </section>
      <section
        className="game-panel flex min-h-0 min-w-0 animate-rise flex-col p-4"
        style={{ animationDelay: '2.6s' }}
        aria-label="Hitlist"
      >
        <h3 className="mb-3 font-display text-2xl font-bold text-ink">
          Hitlist · {final.totalPlayers} racers
        </h3>
        <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {final.ranking.map((player) => (
            <li
              key={player.playerId}
              className={cx(
                'flex items-center gap-2 rounded-lg px-3 py-2 sm:gap-3',
                player.rank === 1 ? 'bg-sun-soft' : player.rank <= 3 ? 'bg-sky-soft' : 'bg-surface',
              )}
            >
              <span className="w-7 shrink-0 font-pixel text-xs">{player.rank}.</span>
              <Kart kart={player.kart} scale={1.5} title={false} />
              <span className="min-w-0 flex-1 truncate text-lg font-bold">{player.nickname}</span>
              <span className="hidden text-sm text-mist sm:inline">{player.correctCount} correct</span>
              <span className="w-20 shrink-0 text-right font-pixel text-xs">
                {formatPoints(player.score)}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
