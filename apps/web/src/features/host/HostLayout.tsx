import { Suspense } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../design/Button';
import { Notice } from '../../design/Panel';
import { Logo, Spinner } from '../../design/Widgets';
import { cx } from '../../lib/cx';
import { RequireHost } from './RequireHost';

const navClass = ({ isActive }: { isActive: boolean }) =>
  cx(
    'inline-flex min-h-11 items-center rounded-xl px-4 py-2 text-sm font-bold transition-colors',
    isActive ? 'bg-sun-soft text-ink' : 'text-mist hover:bg-sky-soft hover:text-sky',
  );

function HostChrome() {
  const auth = useAuth();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="race-header sticky top-0 z-30">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/host" aria-label="Dashboard">
            <Logo size="sm" />
          </Link>
          <nav className="flex gap-1" aria-label="Host">
            <NavLink to="/host" end className={navClass}>
              Quizzes
            </NavLink>
            <NavLink to="/host/history" className={navClass}>
              Past races
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm text-mist sm:inline">{auth.user?.name}</span>
            {auth.mode === 'guest' ? (
              <Link to="/" className={navClass({ isActive: false })}>
                Home
              </Link>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => void auth.signOut()}>
                Sign out
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {auth.mode === 'guest' && (
          <Notice className="mb-6">
            No account needed. Return in this browser to access your quizzes and results. Clearing site data
            removes your private host key and access to them.
          </Notice>
        )}
        <Suspense fallback={<Spinner className="min-h-[40vh]" />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}

export function HostLayout() {
  return (
    <RequireHost>
      <HostChrome />
    </RequireHost>
  );
}
