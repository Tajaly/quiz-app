import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../design/Button';
import { TextField } from '../../design/Field';
import { Notice, Panel } from '../../design/Panel';
import { RaceScene } from '../../design/Scenery';
import { Logo, Spinner } from '../../design/Widgets';

function SignInScreen() {
  const auth = useAuth();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const signInDev = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await auth.signIn({ devName: name });
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : 'Sign-in failed.');
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-8">
      <Link to="/" className="self-center" aria-label="Power Quiz home">
        <Logo />
      </Link>
      <Panel title="Host sign-in">
        {auth.mode === 'entra' ? (
          <div className="flex flex-col gap-4">
            <p className="text-lg text-mist">
              Sign in with your work or school account to manage quizzes and run races.
            </p>
            <Button
              size="lg"
              icon="user"
              onClick={() =>
                void auth.signIn({ returnTo: window.location.href }).catch((signInError: unknown) => {
                  setError(signInError instanceof Error ? signInError.message : 'Sign-in failed.');
                })
              }
            >
              Sign in with Microsoft
            </Button>
            {error && <Notice tone="error">{error}</Notice>}
          </div>
        ) : (
          <form onSubmit={signInDev} className="flex flex-col gap-4">
            <Notice>Development mode: name-only access. Use guest hosting or Entra ID in production.</Notice>
            <TextField
              label="Your name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={40}
              autoComplete="name"
              error={error}
            />
            <Button type="submit" size="lg" icon="user">
              Sign in (dev)
            </Button>
          </form>
        )}
      </Panel>
      <RaceScene />
    </main>
  );
}

/** Prepares private host access lazily; guest hosts go straight through without a sign-in screen. */
export function RequireHost({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { activate, status } = auth;
  useEffect(() => {
    if (status === 'idle') activate();
  }, [activate, status]);

  if (status === 'idle' || status === 'loading')
    return <Spinner className="min-h-dvh" label="Preparing your host workspace…" />;
  if (status === 'error') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
        <Notice tone="error">{auth.error ?? 'Host access is not available right now.'}</Notice>
        <Button onClick={activate}>Try again</Button>
      </main>
    );
  }
  if (status === 'signedOut') return <SignInScreen />;
  return <>{children}</>;
}
