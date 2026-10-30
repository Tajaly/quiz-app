import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { QuizSummary } from '@power-quiz/shared';
import { Button } from '../../design/Button';
import { Badge, Heading, Notice, Panel } from '../../design/Panel';
import { Icon, Kart } from '../../design/sprites/Sprites';
import { Spinner } from '../../design/Widgets';
import { formatDateTime, formatPin } from '../../lib/format';
import {
  useDeleteQuiz,
  useDuplicateQuiz,
  useLiveSessions,
  useQuizzes,
  useSaveQuiz,
  useStartSession,
} from '../../lib/queries';
import { sampleQuiz } from './sampleQuiz';

const PHASE_LABELS: Record<string, string> = {
  lobby: 'Waiting for racers',
  countdown: 'Starting',
  question: 'Question open',
  reveal: 'Showing answers',
  scoreboard: 'Standings',
  final: 'Podium',
  ended: 'Finished',
};

function LiveRaces() {
  const live = useLiveSessions();
  const navigate = useNavigate();
  if (!live.data?.length) return null;
  return (
    <Panel title="Live now">
      <ul className="grid gap-2">
        {live.data.map((race) => (
          <li
            key={race.sessionId}
            className="flex flex-wrap items-center gap-3 rounded-xl bg-sky-soft px-4 py-3"
          >
            <span className="h-3 w-3 animate-blink rounded-full bg-leaf" aria-hidden />
            <span className="flex-1 text-lg font-bold">{race.quizTitle}</span>
            <Badge>PIN {formatPin(race.pin)}</Badge>
            <Badge>{race.playerCount} racers</Badge>
            <Badge>{PHASE_LABELS[race.phase] ?? race.phase}</Badge>
            <Button size="sm" icon="fullscreen" onClick={() => navigate(`/host/live/${race.sessionId}`)}>
              Open big screen
            </Button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function QuizCard({ quiz }: { quiz: QuizSummary }) {
  const navigate = useNavigate();
  const start = useStartSession();
  const duplicate = useDuplicateQuiz();
  const remove = useDeleteQuiz();
  const [error, setError] = useState<string | null>(null);

  const startRace = () => {
    setError(null);
    start.mutate(quiz.id, {
      onSuccess: ({ sessionId }) => navigate(`/host/live/${sessionId}`),
      onError: (startError) => setError(startError.message),
    });
  };

  return (
    <li className="game-panel flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <Icon name="flag" size={2.5} className="mt-1 shrink-0 text-sky" />
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-xl font-bold leading-tight">{quiz.title}</h3>
          {quiz.description && <p className="mt-1 line-clamp-2 text-mist">{quiz.description}</p>}
        </div>
      </div>
      <p className="text-sm text-mist">
        {quiz.questionCount} {quiz.questionCount === 1 ? 'question' : 'questions'} · updated{' '}
        {formatDateTime(quiz.updatedAt)}
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="mt-auto flex flex-wrap gap-1">
        <Button
          size="sm"
          icon="play"
          onClick={startRace}
          disabled={start.isPending || quiz.questionCount === 0}
        >
          {start.isPending ? 'Starting…' : 'Start race'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon="pencil"
          onClick={() => navigate(`/host/quizzes/${quiz.id}`)}
        >
          Edit
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon="copy"
          aria-label={`Duplicate ${quiz.title}`}
          onClick={() => duplicate.mutate(quiz.id)}
          disabled={duplicate.isPending}
        >
          Copy
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon="trash"
          aria-label={`Delete ${quiz.title}`}
          onClick={() => {
            if (window.confirm(`Delete “${quiz.title}”? Past race results are kept.`)) remove.mutate(quiz.id);
          }}
          disabled={remove.isPending}
        >
          Delete
        </Button>
      </div>
    </li>
  );
}

export function Dashboard() {
  const quizzes = useQuizzes();
  const save = useSaveQuiz();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Heading className="text-4xl sm:text-5xl">Your quizzes</Heading>
        <div className="flex flex-wrap gap-1">
          <Button
            variant="secondary"
            icon="star"
            disabled={save.isPending}
            onClick={() => save.mutate({ input: sampleQuiz() })}
          >
            Add sample quiz
          </Button>
          <Button icon="plus" onClick={() => navigate('/host/quizzes/new')}>
            New quiz
          </Button>
        </div>
      </div>

      <LiveRaces />

      {quizzes.isPending ? (
        <Spinner />
      ) : quizzes.isError ? (
        <Notice tone="error">Could not load your quizzes: {quizzes.error.message}</Notice>
      ) : quizzes.data.length === 0 ? (
        <Panel className="flex flex-col items-center gap-4 py-10 text-center">
          <Kart kart={{ model: 'classic', color: 'yellow' }} scale={6} className="animate-bob" />
          <p className="font-display text-3xl font-bold text-sky-dark">The garage is empty</p>
          <p className="max-w-md text-lg text-mist">
            Create your first quiz, or add the sample quiz to take Power Quiz for a test drive.
          </p>
          <div className="flex flex-wrap justify-center gap-1">
            <Button icon="plus" onClick={() => navigate('/host/quizzes/new')}>
              New quiz
            </Button>
            <Button variant="secondary" icon="star" onClick={() => save.mutate({ input: sampleQuiz() })}>
              Add sample quiz
            </Button>
          </div>
        </Panel>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {quizzes.data.map((quiz) => (
            <QuizCard key={quiz.id} quiz={quiz} />
          ))}
        </ul>
      )}

      <p className="text-center text-sm text-mist">
        Looking for results of earlier races?{' '}
        <Link to="/host/history" className="text-sky underline underline-offset-4">
          Open past races
        </Link>
      </p>
    </div>
  );
}
