import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  nicknameSchema,
  randomKart,
  type AckResponse,
  type Kart,
  type PlayerCredentials,
} from '@power-quiz/shared';
import { ApiError, fetchJoinInfo } from '../../lib/api';
import { loadLastPlayer } from '../../lib/storage';
import { Button } from '../../design/Button';
import { TextField } from '../../design/Field';
import { Heading, Notice, Panel } from '../../design/Panel';
import { Spinner } from '../../design/Widgets';
import { MessageScreen } from '../landing/NotFound';
import { KartGarage } from './KartGarage';

const linkClass = 'font-pixel text-xs text-sky underline underline-offset-4 hover:text-white';

export function JoinForm({
  pin,
  onJoin,
}: {
  pin: string;
  onJoin: (nickname: string, kart: Kart) => Promise<AckResponse<{ credentials: PlayerCredentials }>>;
}) {
  const info = useQuery({ queryKey: ['join-info', pin], queryFn: () => fetchJoinInfo(pin), retry: false });
  const [last] = useState(loadLastPlayer);
  const [nickname, setNickname] = useState(last?.nickname ?? '');
  const [kart, setKart] = useState<Kart>(() => last?.kart ?? randomKart());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (info.isPending) return <Spinner className="min-h-dvh" label="Finding your race…" />;
  if (info.isError && info.error instanceof ApiError && info.error.status === 429) {
    return (
      <MessageScreen
        icon="clock"
        title="Slow down, racer!"
        action={
          <button type="button" className={linkClass} onClick={() => void info.refetch()}>
            Try again
          </button>
        }
      >
        Too many wrong PINs were tried from your network. Please wait a minute and try again.
      </MessageScreen>
    );
  }
  if (info.isError) {
    return (
      <MessageScreen
        icon="cone"
        title="Race not found"
        action={
          <Link to="/join" className={linkClass}>
            Try another PIN
          </Link>
        }
      >
        There is no race with PIN {pin}. Check the number on the big screen.
      </MessageScreen>
    );
  }

  const race = info.data;
  if (!race.joinable) {
    const over = race.phase === 'final' || race.phase === 'ended';
    return (
      <MessageScreen
        icon={over ? 'flag' : 'lock'}
        title={over ? 'This race is over' : race.locked ? 'Race locked' : 'Race full'}
        action={
          <Link to="/" className={linkClass}>
            Back to the start
          </Link>
        }
      >
        {over
          ? 'The checkered flag has already dropped. Ask the host for the next race!'
          : race.locked
            ? 'The host has locked this race. Ask them to unlock it so you can join.'
            : 'There is no space left on the starting grid.'}
      </MessageScreen>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = nicknameSchema.safeParse(nickname);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Choose another nickname.');
      return;
    }
    setBusy(true);
    setError(null);
    const response = await onJoin(parsed.data, kart);
    setBusy(false);
    if (!response.ok) setError(response.error);
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-3 py-6">
      <div className="text-center">
        <p className="font-pixel text-[10px] text-mist">RACE PIN {pin}</p>
        <Heading className="mt-3 text-lg">{race.quizTitle}</Heading>
      </div>
      <Panel>
        <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
          <TextField
            label="Your racer name"
            hint="max. 20 characters"
            value={nickname}
            maxLength={20}
            autoComplete="nickname"
            autoCapitalize="words"
            enterKeyHint="go"
            onChange={(event) => {
              setNickname(event.target.value);
              setError(null);
            }}
            placeholder="e.g. Turbo Tina"
          />
          <KartGarage value={kart} onChange={setKart} />
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" size="lg" icon="flag" disabled={busy}>
            {busy ? 'Joining…' : 'Join the race'}
          </Button>
          <p className="text-xs text-mist/80">
            Your nickname, kart and answers appear on the host’s big screen and are kept with the race results
            for up to 90 days.
          </p>
        </form>
      </Panel>
    </main>
  );
}
