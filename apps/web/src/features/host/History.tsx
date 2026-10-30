import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../design/Button';
import { Badge, Heading, Notice, Panel } from '../../design/Panel';
import { Spinner } from '../../design/Widgets';
import { useApi } from '../../lib/api';
import { formatDateTime, formatPoints } from '../../lib/format';
import { useDeleteSession, useSessionHistory } from '../../lib/queries';

export function HistoryPage() {
  const history = useSessionHistory();
  const remove = useDeleteSession();
  const api = useApi();
  const [error, setError] = useState<string | null>(null);

  const download = (id: string) => {
    setError(null);
    api.downloadResultsCsv(id).catch((downloadError: unknown) => {
      setError(downloadError instanceof Error ? downloadError.message : 'Download failed.');
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <Heading className="text-4xl sm:text-5xl">Past races</Heading>
      <p className="text-mist">Results are kept for 90 days. Download them as CSV to keep them longer.</p>
      {error && <Notice tone="error">{error}</Notice>}
      {history.isPending ? (
        <Spinner />
      ) : history.isError ? (
        <Notice tone="error">Could not load past races: {history.error.message}</Notice>
      ) : history.data.length === 0 ? (
        <Panel className="text-center text-lg text-mist">No races yet. Start one from your quizzes!</Panel>
      ) : (
        <Panel className="overflow-x-auto p-0 sm:p-0">
          <table className="w-full min-w-[720px] text-left">
            <thead className="bg-surface text-xs font-bold uppercase text-mist">
              <tr>
                <th className="p-4">Date</th>
                <th className="p-4">Quiz</th>
                <th className="p-4">Racers</th>
                <th className="p-4">Winner</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.data.map((race) => (
                <tr key={race.id} className="border-t border-border">
                  <td className="p-4 whitespace-nowrap">{formatDateTime(race.startedAt)}</td>
                  <td className="p-4 font-bold">
                    <Link to={`/host/history/${race.id}`} className="hover:text-sky hover:underline">
                      {race.quizTitle}
                    </Link>
                  </td>
                  <td className="p-4">{race.playerCount}</td>
                  <td className="p-4">
                    {race.winner ? `${race.winner.nickname} (${formatPoints(race.winner.score)})` : '–'}
                  </td>
                  <td className="p-4">
                    <Badge>
                      {race.status === 'completed'
                        ? 'Finished'
                        : race.status === 'live'
                          ? 'Live'
                          : 'Ended early'}
                    </Badge>
                  </td>
                  <td className="p-4">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="secondary" icon="download" onClick={() => download(race.id)}>
                        CSV
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="trash"
                        aria-label={`Delete results of ${race.quizTitle}`}
                        disabled={remove.isPending}
                        onClick={() => {
                          if (window.confirm('Delete these race results permanently?'))
                            remove.mutate(race.id);
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
