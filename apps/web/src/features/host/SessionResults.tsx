import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { QuestionAnswersRecord, SessionDetail } from '@power-quiz/shared';
import { answerStyle } from '../../design/answers';
import { Button } from '../../design/Button';
import { Badge, Heading, Notice, Panel } from '../../design/Panel';
import { Icon, Kart } from '../../design/sprites/Sprites';
import { Spinner } from '../../design/Widgets';
import { useApi } from '../../lib/api';
import { cx } from '../../lib/cx';
import { formatDateTime, formatPoints, formatSeconds, percent } from '../../lib/format';
import { useDeleteSession, useSessionDetail } from '../../lib/queries';

function QuestionBreakdown({ detail, index }: { detail: SessionDetail; index: number }) {
  const question = detail.session.questions[index];
  const stat = detail.session.questionStats.find((candidate) => candidate.questionIndex === index);
  const answers: QuestionAnswersRecord | undefined = detail.answers.find(
    (record) => record.questionIndex === index,
  );
  if (!question) return null;
  return (
    <Panel>
      <p className="font-pixel text-[10px] uppercase text-mist">
        Q{index + 1} · {question.type === 'mc' ? 'Multiple choice' : 'Open question'}
      </p>
      <h3 className="mt-2 text-xl font-bold">{question.text}</h3>
      {!stat ? (
        <p className="mt-3 text-mist">Not played – the race ended before this question.</p>
      ) : question.type === 'mc' ? (
        <div className="mt-4 grid gap-2">
          {question.options.map((option, optionIndex) => {
            const count = stat.distribution?.find((entry) => entry.optionId === option.id)?.count ?? 0;
            const share = percent(count, stat.answeredCount);
            const correct = option.id === question.correctOptionId;
            const style = answerStyle(optionIndex);
            return (
              <div key={option.id} className="flex items-center gap-3">
                <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center', style.className)}>
                  <Icon name={style.icon} size={1.8} />
                </span>
                <div className="relative h-9 flex-1 bg-night-950">
                  <div
                    className="absolute inset-y-0 left-0"
                    style={{ width: `${share}%`, backgroundColor: style.barColor }}
                  />
                  <span className="relative z-10 flex h-full items-center gap-2 px-3 font-bold drop-shadow-[0_2px_0_rgb(18_10_36)]">
                    {option.text}{' '}
                    {correct && <Icon name="check" size={1.6} className="text-lime" title="Correct" />}
                  </span>
                </div>
                <span className="w-24 text-right tabular-nums">
                  {count} · {share}%
                </span>
              </div>
            );
          })}
          <p className="mt-2 text-sm text-mist">
            {percent(stat.correctCount ?? 0, stat.answeredCount)}% correct · {stat.answeredCount} answers
            {stat.avgResponseMs !== null && ` · avg ${formatSeconds(stat.avgResponseMs)}`}
          </p>
        </div>
      ) : (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {(answers?.answers ?? []).map((answer) => (
            <li
              key={answer.playerId}
              className={cx('px-frame m-1 bg-night-950 p-3', answer.hidden && 'opacity-60')}
            >
              <p className="text-sm font-bold text-sun">{answer.nickname}</p>
              <p className="break-words">{answer.text}</p>
              {answer.hidden && <p className="text-xs text-mist">Hidden on the big screen</p>}
            </li>
          ))}
          {(answers?.answers.length ?? 0) === 0 && <li className="text-mist">No answers.</li>}
        </ul>
      )}
    </Panel>
  );
}

export function SessionResultsPage() {
  const { sessionId = '' } = useParams();
  const detail = useSessionDetail(sessionId);
  const remove = useDeleteSession();
  const api = useApi();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  if (detail.isPending) return <Spinner />;
  if (detail.isError)
    return <Notice tone="error">Could not load these results: {detail.error.message}</Notice>;
  const { session } = detail.data;

  return (
    <div className="flex flex-col gap-6">
      <Link to="/host/history" className="inline-flex items-center gap-2 text-mist hover:text-white">
        <Icon name="back" size={1.6} /> Past races
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Heading className="text-lg sm:text-2xl">{session.quizTitle}</Heading>
          <div className="mt-3 flex flex-wrap gap-1">
            <Badge>{formatDateTime(session.startedAt)}</Badge>
            <Badge>{session.players.length} racers</Badge>
            <Badge>
              {session.status === 'completed'
                ? 'Finished'
                : session.status === 'live'
                  ? 'Live'
                  : 'Ended early'}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button
            icon="download"
            onClick={() => {
              setError(null);
              api.downloadResultsCsv(session.id).catch((downloadError: unknown) => {
                setError(downloadError instanceof Error ? downloadError.message : 'Download failed.');
              });
            }}
          >
            Download CSV
          </Button>
          <Button
            variant="ghost"
            icon="trash"
            disabled={remove.isPending}
            onClick={() => {
              if (!window.confirm('Delete these race results permanently?')) return;
              remove.mutate(session.id, { onSuccess: () => navigate('/host/history') });
            }}
          >
            Delete
          </Button>
        </div>
      </div>
      {error && <Notice tone="error">{error}</Notice>}

      <Panel title="Hitlist">
        {session.players.length === 0 ? (
          <p className="text-mist">Nobody joined this race.</p>
        ) : (
          <ol className="grid gap-2">
            {session.players.map((player) => (
              <li
                key={player.playerId}
                className={cx(
                  'px-frame m-1 flex items-center gap-3 px-3 py-2',
                  player.rank === 1 ? 'bg-sun text-ink' : player.rank <= 3 ? 'bg-night-600' : 'bg-night-950',
                )}
              >
                <span className="w-10 font-pixel text-sm">{player.rank}.</span>
                <Kart kart={player.kart} scale={2} title={false} />
                <span className="flex-1 truncate text-lg font-bold">{player.nickname}</span>
                <span className="hidden text-sm sm:inline">{player.correctCount} correct</span>
                <span className="w-24 text-right font-pixel text-xs">{formatPoints(player.score)}</span>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <h2 className="font-pixel text-sm text-sun">Question by question</h2>
      {session.questions.map((question, index) => (
        <QuestionBreakdown key={question.id} detail={detail.data} index={index} />
      ))}
    </div>
  );
}
