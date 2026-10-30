import { Link, useParams } from 'react-router';
import { pinSchema } from '@power-quiz/shared';
import { Panel } from '../../design/Panel';
import { RaceScene } from '../../design/Scenery';
import { Logo, Spinner } from '../../design/Widgets';
import { PinForm } from '../landing/Landing';
import { MessageScreen } from '../landing/NotFound';
import { JoinForm } from './JoinForm';
import { PlayerHeader, PlayerStage } from './PlayerStage';
import { usePlayerSession } from './usePlayerSession';

function PinEntry({ error }: { error?: string }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-8">
      <Link to="/" className="self-center" aria-label="Power Quiz home">
        <Logo />
      </Link>
      <Panel title="Join a race">
        <PinForm initialError={error} />
      </Panel>
      <RaceScene />
    </main>
  );
}

function PlayerGame({ pin }: { pin: string }) {
  const session = usePlayerSession(pin);

  if (session.status === 'kicked') {
    return (
      <MessageScreen
        icon="cross"
        title="Removed from the race"
        action={
          <Link to="/" className="font-pixel text-xs text-sky underline underline-offset-4">
            Back to the start
          </Link>
        }
      >
        The host removed you from this race.
      </MessageScreen>
    );
  }
  if (session.status === 'over') {
    return (
      <MessageScreen
        icon="flag"
        title="This race is over"
        action={
          <Link to="/join" className="font-pixel text-xs text-sky underline underline-offset-4">
            Join another race
          </Link>
        }
      >
        The checkered flag has dropped. Ask the host for the PIN of the next race!
      </MessageScreen>
    );
  }
  if (session.status === 'connecting') return <Spinner className="min-h-dvh" label="Connecting…" />;
  if (session.status === 'join') return <JoinForm pin={pin} onJoin={session.join} />;
  if (!session.timed) return <Spinner className="min-h-dvh" label="Rolling onto the grid…" />;

  return (
    <div className="flex min-h-dvh flex-col">
      <PlayerHeader view={session.timed.view} online={session.online} />
      <PlayerStage timed={session.timed} onAnswer={session.answer} />
    </div>
  );
}

export function PlayerPage() {
  const { pin } = useParams();
  if (!pin) return <PinEntry />;
  const parsed = pinSchema.safeParse(pin);
  if (!parsed.success) return <PinEntry error="That PIN doesn’t look right – it has 6 digits." />;
  return <PlayerGame key={parsed.data} pin={parsed.data} />;
}
