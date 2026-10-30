import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  LIMITS,
  type AckResponse,
  type AnswerPayload,
  type PlayerView,
  type QuestionPublic,
} from '@power-quiz/shared';
import { answerStyle } from '../../design/answers';
import { Button } from '../../design/Button';
import { TextField } from '../../design/Field';
import { Notice } from '../../design/Panel';
import { Icon, Kart } from '../../design/sprites/Sprites';
import { Confetti, TimerBar, TrafficLight, lightStateFor } from '../../design/Widgets';
import { cx } from '../../lib/cx';
import { formatPoints, ordinal } from '../../lib/format';
import { useRemainingMs, type Timed } from '../../lib/socket';

type Answer = (payload: AnswerPayload) => Promise<AckResponse>;

export function PlayerHeader({ view, online }: { view: PlayerView; online: boolean }) {
  // Until the first answers are scored, ranks only reflect join order.
  const showRank =
    view.me.rank > 0 &&
    view.phase !== 'lobby' &&
    !(view.questionIndex === 0 && (view.phase === 'countdown' || view.phase === 'question'));
  return (
    <header className="sticky top-0 z-20 border-b-4 border-ink bg-night-900/95 backdrop-blur">
      <div className="mx-auto flex max-w-lg items-center gap-3 px-3 py-2">
        <Kart kart={view.me.kart} scale={2} title={false} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold leading-tight">{view.me.nickname}</p>
          <p className="truncate text-xs text-mist">{view.quizTitle}</p>
        </div>
        <div className="text-right">
          <p className="font-pixel text-sm text-sun">{formatPoints(view.me.score)}</p>
          {showRank && <p className="text-xs text-mist">{ordinal(view.me.rank)} place</p>}
        </div>
      </div>
      {!online && (
        <p role="status" className="bg-flame px-3 py-1 text-center text-sm font-bold">
          Connection lost – reconnecting…
        </p>
      )}
    </header>
  );
}

function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('mx-auto flex w-full max-w-lg flex-1 flex-col gap-5 px-3 py-5', className)}>
      {children}
    </div>
  );
}

function QuestionLabel({ view }: { view: PlayerView }) {
  return (
    <p className="font-pixel text-[10px] uppercase tracking-wide text-mist">
      Question {view.questionIndex + 1} of {view.questionCount}
    </p>
  );
}

function Lobby({ view }: { view: PlayerView }) {
  return (
    <Screen className="items-center justify-center text-center">
      <p className="font-pixel text-sm text-sun">You’re on the grid!</p>
      <div className="animate-bob py-4">
        <Kart kart={view.me.kart} scale={8} className="max-w-full" />
      </div>
      <p className="text-3xl font-bold">{view.me.nickname}</p>
      <p className="text-lg text-mist">Look at the big screen – the host starts the race soon.</p>
      <p className="px-frame m-1 bg-night-800 px-4 py-2 font-pixel text-xs">
        {view.playerCount} {view.playerCount === 1 ? 'racer' : 'racers'} ready
      </p>
    </Screen>
  );
}

function Countdown({ timed }: { timed: Timed<PlayerView> }) {
  const { view } = timed;
  const remaining = useRemainingMs(view.countdown, timed.receivedAt);
  return (
    <Screen className="items-center justify-center text-center">
      <QuestionLabel view={view} />
      <TrafficLight state={lightStateFor(remaining)} size="md" />
      {view.question && <p className="text-2xl font-bold leading-snug">{view.question.text}</p>}
    </Screen>
  );
}

function OptionButton({
  question,
  index,
  selected,
  disabled,
  onPick,
}: {
  question: QuestionPublic;
  index: number;
  selected: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const option = question.options?.[index];
  const style = answerStyle(index);
  if (!option) return null;
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      aria-pressed={selected}
      className={cx(
        'px-frame-raised m-1 flex min-h-20 items-center gap-3 px-4 py-3 text-left text-xl font-bold transition-transform active:translate-y-1',
        style.className,
        disabled && !selected && 'opacity-40',
        selected && 'scale-[1.02] [--px-color:white]',
      )}
    >
      <Icon name={style.icon} size={3} />
      <span className="flex-1 break-words">{option.text}</span>
      {selected && <Icon name="check" size={2.5} />}
    </button>
  );
}

function Question({ timed, onAnswer }: { timed: Timed<PlayerView>; onAnswer: Answer }) {
  const { view } = timed;
  const question = view.question;
  const remaining = useRemainingMs(view.timer, timed.receivedAt);
  const [pending, setPending] = useState<{ index: number; optionId?: string; text?: string } | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Reset local state whenever a new question starts.
  const [questionIndex, setQuestionIndex] = useState(view.questionIndex);
  if (questionIndex !== view.questionIndex) {
    setQuestionIndex(view.questionIndex);
    setPending(null);
    setText('');
    setError(null);
  }

  if (!question) return null;
  const submitted = view.myAnswer ?? (pending?.index === question.index ? pending : null);
  const timeUp = remaining <= 0;

  const send = async (payload: AnswerPayload) => {
    setPending({ index: payload.questionIndex, optionId: payload.optionId, text: payload.text });
    setError(null);
    const response = await onAnswer(payload);
    if (!response.ok && response.code !== 'ALREADY_ANSWERED') {
      setPending(null);
      setError(response.error);
    }
  };

  const submitText = (event: FormEvent) => {
    event.preventDefault();
    const value = text.replace(/\s+/g, ' ').trim();
    if (!value) {
      setError('Type an answer first.');
      return;
    }
    void send({ questionIndex: question.index, text: value });
  };

  return (
    <Screen>
      <QuestionLabel view={view} />
      {view.timer && <TimerBar remainingMs={remaining} totalMs={view.timer.totalMs} />}
      <h2 className="text-2xl font-bold leading-snug">{question.text}</h2>

      {question.type === 'mc' ? (
        <div className="grid gap-2">
          {question.options?.map((option, index) => (
            <OptionButton
              key={option.id}
              question={question}
              index={index}
              selected={submitted?.optionId === option.id}
              disabled={!!submitted || timeUp}
              onPick={() => void send({ questionIndex: question.index, optionId: option.id })}
            />
          ))}
        </div>
      ) : submitted ? (
        <div className="px-frame m-1 bg-white p-4 text-xl font-bold text-ink">“{submitted.text}”</div>
      ) : (
        <form onSubmit={submitText} className="flex flex-col gap-3">
          <TextField
            label="Your answer"
            value={text}
            maxLength={LIMITS.openAnswerMax}
            hint={`${text.length}/${LIMITS.openAnswerMax}`}
            onChange={(event) => setText(event.target.value)}
            disabled={timeUp}
            autoComplete="off"
            enterKeyHint="send"
          />
          <Button type="submit" size="lg" icon="play" disabled={timeUp}>
            Send answer
          </Button>
        </form>
      )}

      {error && <Notice tone="error">{error}</Notice>}
      {submitted ? (
        <p role="status" className="animate-pop text-center font-pixel text-sm text-lime">
          Locked in! Waiting for the others…
        </p>
      ) : (
        timeUp && <p className="text-center font-pixel text-sm text-flame">Time’s up!</p>
      )}
    </Screen>
  );
}

function Standing({ view }: { view: PlayerView }) {
  const result = view.result;
  if (!result) return null;
  return (
    <div className="px-frame m-1 flex flex-col items-center gap-1 bg-night-800 p-4 text-center">
      <p className="font-pixel text-xs text-mist">You’re in</p>
      <p className="px-text-outline font-pixel text-4xl text-sun">{ordinal(result.rank)}</p>
      <p className="text-lg">{formatPoints(result.totalScore)} points</p>
      <p className="text-sm text-mist">
        {result.rank === 1
          ? 'You’re leading the race!'
          : result.gapToNext !== null && result.nextNickname
            ? `${formatPoints(result.gapToNext)} points behind ${result.nextNickname}`
            : ''}
      </p>
    </div>
  );
}

function Result({ view }: { view: PlayerView }) {
  const result = view.result;
  if (!result) return null;
  let card: ReactNode;
  if (result.type === 'open') {
    card = result.answered ? (
      <div className="px-frame m-1 flex flex-col items-center gap-2 bg-sky-dark p-6 text-center">
        <Icon name="check" size={5} />
        <p className="font-pixel text-lg">Answer sent!</p>
        {result.myAnswer?.text && <p className="text-xl">“{result.myAnswer.text}”</p>}
        <p className="text-sm text-white/80">
          Open questions aren’t scored – see what everyone said on the big screen.
        </p>
      </div>
    ) : (
      <div className="px-frame m-1 flex flex-col items-center gap-2 bg-night-600 p-6 text-center">
        <Icon name="clock" size={5} />
        <p className="font-pixel text-lg">No answer this time</p>
      </div>
    );
  } else if (result.correct) {
    card = (
      <div className="px-frame animate-pop m-1 flex flex-col items-center gap-2 bg-lime p-6 text-center text-ink">
        <Icon name="check" size={6} />
        <p className="font-pixel text-xl">Correct!</p>
        <p className="font-pixel text-3xl">+{formatPoints(result.points)}</p>
      </div>
    );
  } else {
    card = (
      <div
        className={cx(
          'px-frame m-1 flex flex-col items-center gap-2 p-6 text-center',
          result.answered ? 'animate-shake bg-flame' : 'bg-night-600',
        )}
      >
        <Icon name={result.answered ? 'cross' : 'clock'} size={6} />
        <p className="font-pixel text-xl">{result.answered ? 'Not this time' : 'Time’s up!'}</p>
        {result.correctOption && (
          <p className="text-lg">
            Correct answer: <strong>{result.correctOption.text}</strong>
          </p>
        )}
      </div>
    );
  }
  return (
    <Screen className="justify-center">
      <QuestionLabel view={view} />
      {card}
      <Standing view={view} />
    </Screen>
  );
}

function Final({ view }: { view: PlayerView }) {
  const final = view.final;
  if (!final) return null;
  const podium = final.rank <= 3;
  return (
    <Screen className="items-center justify-center text-center">
      {final.rank === 1 && <Confetti pieces={40} />}
      <p className="font-pixel text-sm text-mist">Race finished</p>
      {podium && <Icon name="trophy" size={9} className="animate-pop text-sun" />}
      <p className="px-text-outline font-pixel text-5xl text-sun">{ordinal(final.rank)}</p>
      <p className="text-xl">
        of {final.totalPlayers} {final.totalPlayers === 1 ? 'racer' : 'racers'}
      </p>
      <div className="px-frame m-1 grid w-full grid-cols-2 gap-2 bg-night-800 p-4">
        <div>
          <p className="font-pixel text-lg text-sun">{formatPoints(final.score)}</p>
          <p className="text-sm text-mist">points</p>
        </div>
        <div>
          <p className="font-pixel text-lg text-sun">{final.correctCount}</p>
          <p className="text-sm text-mist">correct answers</p>
        </div>
      </div>
      <ol className="w-full space-y-2 text-left">
        {final.podium.map((player) => (
          <li
            key={player.playerId}
            className={cx(
              'px-frame m-1 flex items-center gap-3 bg-night-800 px-3 py-2',
              player.playerId === view.me.id && 'bg-night-500',
            )}
          >
            <span className="w-8 font-pixel text-sm text-sun">{player.rank}.</span>
            <Kart kart={player.kart} scale={2} title={false} />
            <span className="flex-1 truncate font-bold">{player.nickname}</span>
            <span className="font-pixel text-xs">{formatPoints(player.score)}</span>
          </li>
        ))}
      </ol>
      <Link to="/" className="font-pixel text-xs text-sky underline underline-offset-4">
        Back to the start
      </Link>
    </Screen>
  );
}

export function PlayerStage({ timed, onAnswer }: { timed: Timed<PlayerView>; onAnswer: Answer }) {
  const { view } = timed;
  switch (view.phase) {
    case 'lobby':
      return <Lobby view={view} />;
    case 'countdown':
      return <Countdown timed={timed} />;
    case 'question':
      return <Question timed={timed} onAnswer={onAnswer} />;
    case 'reveal':
    case 'scoreboard':
      return <Result view={view} />;
    case 'final':
      return <Final view={view} />;
    case 'ended':
      return view.final ? (
        <Final view={view} />
      ) : (
        <Screen className="items-center justify-center text-center">
          <Icon name="flag" size={6} className="text-sun" />
          <p className="font-pixel text-lg">Race cancelled</p>
          <p className="text-mist">The host ended the race before it started.</p>
          <Link to="/" className="font-pixel text-xs text-sky underline underline-offset-4">
            Back to the start
          </Link>
        </Screen>
      );
  }
}
