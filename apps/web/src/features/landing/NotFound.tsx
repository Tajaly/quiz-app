import type { ReactNode } from 'react';
import { Link, isRouteErrorResponse, useRouteError } from 'react-router';
import { Panel } from '../../design/Panel';
import { Icon } from '../../design/sprites/Sprites';
import type { IconName } from '../../design/sprites/icons';
import { Logo } from '../../design/Widgets';

export function MessageScreen({
  icon = 'cone',
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <Link to="/" aria-label="Power Quiz home">
        <Logo size="sm" />
      </Link>
      <Panel className="flex max-w-lg flex-col items-center gap-4">
        <Icon name={icon} size={6} className="text-sun-dark" />
        <h1 className="font-display text-4xl font-bold leading-tight">{title}</h1>
        {children && <div className="text-lg text-mist">{children}</div>}
        {action}
      </Panel>
    </div>
  );
}

const linkClass = 'font-semibold text-sky underline underline-offset-4 hover:text-sky-dark';

export function NotFound() {
  return (
    <MessageScreen
      icon="cone"
      title="Wrong turn!"
      action={
        <Link to="/" className={linkClass}>
          Back to the start
        </Link>
      }
    >
      This page is not on the race track.
    </MessageScreen>
  );
}

export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Something went wrong.';
  return (
    <MessageScreen
      icon="cross"
      title="Engine trouble!"
      action={
        <button type="button" className={linkClass} onClick={() => window.location.reload()}>
          Reload the page
        </button>
      }
    >
      {message}
    </MessageScreen>
  );
}
