import { Suspense } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../design/Button';
import { Logo, Spinner } from '../../design/Widgets';
import { cx } from '../../lib/cx';
import { RequireHost } from './RequireHost';

const navClass = ({ isActive }: { isActive: boolean }) =>
  cx(
    'px-3 py-2 font-pixel text-[10px] uppercase leading-none transition-colors',
    isActive ? 'bg-night-600 text-sun' : 'text-mist hover:text-white',
  );

function HostChrome() {
  const auth = useAuth();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b-4 border-ink bg-night-900/95 backdrop-blur">
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
            <Button variant="ghost" size="sm" onClick={() => void auth.signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
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
