import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../design/Button';
import { TextField } from '../../design/Field';
import { Notice, Panel } from '../../design/Panel';
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
              onClick={() => void auth.signIn({ returnTo: window.location.href }).catch(() => undefined)}
            >
              Sign in with Microsoft
            </Button>
          </div>
        ) : (
          <form onSubmit={signInDev} className="flex flex-col gap-4">
            <Notice>Development mode: no real authentication. Configure Entra ID before going live.</Notice>
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
    </main>
  );
}

/** Gate for host pages: loads sign-in support lazily and shows the sign-in screen when needed. */
export function RequireHost({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { activate, status } = auth;
  useEffect(() => {
    if (status === 'idle') activate();
  }, [activate, status]);

  if (status === 'idle' || status === 'loading')
    return <Spinner className="min-h-dvh" label="Checking sign-in…" />;
  if (status === 'error') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
        <Notice tone="error">{auth.error ?? 'Sign-in is not available right now.'}</Notice>
        <Button onClick={activate}>Try again</Button>
      </main>
    );
  }
  if (status === 'signedOut') return <SignInScreen />;
  return <>{children}</>;
}
