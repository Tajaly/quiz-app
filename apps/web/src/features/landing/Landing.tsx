import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { pinSchema } from '@power-quiz/shared';
import { Button } from '../../design/Button';
import { TextField } from '../../design/Field';
import { RaceScene } from '../../design/Scenery';
import { Icon } from '../../design/sprites/Sprites';
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
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <TextField
        label="Race PIN"
        name="pin"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        placeholder="000000"
        value={pin}
        onChange={(event) => {
          setPin(event.target.value.replace(/\D/g, ''));
          setError(undefined);
        }}
        error={error}
        className="pin-input"
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
    <div className="landing-page flex min-h-dvh flex-col">
      <header className="landing-header">
        <Link to="/" aria-label="Power Quiz home">
          <Logo />
        </Link>
        <p className="hidden items-center gap-2 text-sm font-semibold text-sky sm:flex">
          <Icon name="trophy" size={1.5} />A quiz. A race. A good time.
        </p>
      </header>
      <main className="landing-layout flex-1">
        <div className="landing-intro">
          <h1 className="landing-title">
            Ready, set, <span>quiz!</span>
          </h1>
          <p className="landing-copy">
            The pixel-kart quiz race. Answer fast, overtake your friends and drive home the trophy!
          </p>
        </div>
        <div className="landing-actions">
          <section className="game-panel join-ticket" aria-labelledby="join-heading">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="join-heading">Join a race</h2>
              <Icon name="flag" size={2.2} className="text-sky" />
            </div>
            <p className="mb-6 text-sm leading-relaxed text-mist">
              Your starting line is right here. Enter the PIN from the big screen.
            </p>
            <PinForm />
            <p className="mt-4 flex items-center justify-center gap-2 text-xs text-mist">
              <Icon name="check" size={1} className="text-leaf" />
              No account needed. Just your game face.
            </p>
          </section>
          <section className="host-entry" aria-labelledby="host-heading">
            <h2 id="host-heading" className="font-display text-2xl font-bold">
              Running the show?
            </h2>
            <p className="mb-4 mt-2 text-sm leading-relaxed text-mist">
              Build quizzes, put the big screen on the projector and lead the race. Players join with their
              phones.
            </p>
            <Button
              variant="secondary"
              icon="flag"
              className="w-[calc(100%-8px)]"
              onClick={() => navigate('/host')}
            >
              Host a quiz
            </Button>
          </section>
        </div>
        <div className="landing-circuit">
          <RaceScene />
          <ol className="race-steps" aria-label="How to race">
            <li>
              <Icon name="tire" size={1.4} /> Pick your kart
            </li>
            <li>
              <Icon name="bolt" size={1.4} /> Answer fast
            </li>
            <li>
              <Icon name="trophy" size={1.4} /> Chase the podium
            </li>
          </ol>
        </div>
      </main>
      <footer className="landing-footer">
        Made for friendly competition. Bring your team, your class, or your whole crew.
      </footer>
    </div>
  );
}
