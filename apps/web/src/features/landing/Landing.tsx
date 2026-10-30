import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { pinSchema } from '@power-quiz/shared';
import { Button } from '../../design/Button';
import { TextField } from '../../design/Field';
import { Panel } from '../../design/Panel';
import { RoadStrip } from '../../design/Scenery';
import { Logo } from '../../design/Widgets';

export function PinForm({ initialError }: { initialError?: string }) {
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | undefined>(initialError);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = pinSchema.safeParse(pin);
    if (!parsed.success) {
      setError('Enter the 6-digit PIN shown on the big screen.');
      return;
    }
    navigate(`/join/${parsed.data}`);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <TextField
        label="Race PIN"
        name="pin"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        placeholder="123456"
        value={pin}
        onChange={(event) => {
          setPin(event.target.value.replace(/\D/g, ''));
          setError(undefined);
        }}
        error={error}
        className="[&_input]:text-center [&_input]:font-pixel [&_input]:text-2xl [&_input]:tracking-[0.3em]"
      />
      <Button type="submit" size="lg" icon="play">
        Join race
      </Button>
    </form>
  );
}

export function Landing() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-10 px-4 py-10">
        <div className="text-center">
          <Logo size="lg" />
          <p className="mx-auto mt-6 max-w-xl text-xl text-mist">
            The pixel-kart quiz race. Answer fast, overtake your friends and drive home the trophy!
          </p>
        </div>
        <div className="grid w-full gap-6 md:grid-cols-2">
          <Panel title="Join a race">
            <PinForm />
          </Panel>
          <Panel title="Host a race" className="flex flex-col">
            <p className="mb-6 text-lg text-mist">
              Build quizzes, put the big screen on the projector and lead the race. Players join with their
              phones – no account needed.
            </p>
            <Button
              variant="secondary"
              size="lg"
              icon="flag"
              className="mt-auto"
              onClick={() => navigate('/host')}
            >
              Host sign-in
            </Button>
          </Panel>
        </div>
      </main>
      <RoadStrip />
    </div>
  );
}
