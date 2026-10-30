import { useCallback, useEffect, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { HostView, PlayerPublic, SessionPhase } from '@power-quiz/shared';
import { Button } from '../../../design/Button';
import { Icon } from '../../../design/sprites/Sprites';
import type { IconName } from '../../../design/sprites/icons';
import { Logo, Spinner } from '../../../design/Widgets';
import { cx } from '../../../lib/cx';
import { formatPin } from '../../../lib/format';
import { useSound } from '../../../sound/useSound';
import type { MusicTrack } from '../../../sound/audio';
import { MessageScreen } from '../../landing/NotFound';
import { RequireHost } from '../RequireHost';
import {
  CountdownStage,
  FinalStage,
  LobbyStage,
  QuestionStage,
  RevealStage,
  ScoreboardStage,
} from './stages';
import { useHostSession } from './useHostSession';

interface PrimaryAction {
  label: string;
  icon: IconName;
  run: 'start' | 'next' | 'endQuestion' | 'dashboard' | 'none';
  disabled?: boolean;
}

export function primaryAction(view: HostView): PrimaryAction {
  const last = view.questionIndex >= view.questionCount - 1;
  const advance: PrimaryAction = last
    ? { label: 'Final results', icon: 'trophy', run: 'next' }
    : { label: 'Next question', icon: 'next', run: 'next' };
  switch (view.phase) {
    case 'lobby':
      return view.playerCount === 0
        ? { label: 'Waiting for racers', icon: 'clock', run: 'none', disabled: true }
        : { label: 'Start race', icon: 'play', run: 'start' };
    case 'countdown':
      return { label: 'Get ready…', icon: 'clock', run: 'none', disabled: true };
    case 'question':
      return { label: 'End question', icon: 'stop', run: 'endQuestion' };
    case 'reveal':
      return view.question?.type === 'mc' ? { label: 'Standings', icon: 'next', run: 'next' } : advance;
    case 'scoreboard':
      return advance;
    case 'final':
      return { label: 'Finish race', icon: 'flag', run: 'next' };
    case 'ended':
      return { label: 'Back to quizzes', icon: 'back', run: 'dashboard' };
  }
}

const MUSIC: Record<SessionPhase, MusicTrack> = {
  lobby: 'lobby',
  countdown: 'none',
  question: 'race',
  reveal: 'none',
  scoreboard: 'results',
  final: 'results',
  ended: 'none',
};

function TopButton({
  icon,
  label,
  onClick,
  pressed,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={cx(
        'flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 transition-colors hover:bg-sky-soft',
        pressed ? 'bg-sun-soft text-sun-dark' : 'text-mist hover:text-sky',
      )}
    >
      <Icon name={icon} size={2.2} />
    </button>
  );
}

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => undefined);
}

function LiveScreen({ sessionId }: { sessionId: string }) {
  const host = useHostSession(sessionId);
  const sound = useSound();
  const navigate = useNavigate();
  const view = host.timed?.view;

  const { unlock, setMusic, play, toggleMuted } = sound;

  // Browsers only allow audio after a user gesture on the page.
  useEffect(() => {
    const onGesture = () => void unlock();
    window.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
  }, [unlock]);

  const phase = view?.phase;
  useEffect(() => {
    if (phase) setMusic(MUSIC[phase]);
  }, [phase, setMusic]);
  useEffect(() => () => setMusic('none'), [setMusic]);

  const previous = useRef<{ phase?: SessionPhase; players: number; answered: number }>({
    players: 0,
    answered: 0,
  });
  useEffect(() => {
    if (!view) return;
    const before = previous.current;
    if (before.phase !== view.phase) {
      if (view.phase === 'reveal') play('reveal');
      if (view.phase === 'scoreboard') play('whoosh');
      if (view.phase === 'final') play('fanfare');
    }
    if (view.phase === 'lobby' && view.playerCount > before.players) play('join');
    if (view.phase === 'question' && view.answeredCount > before.answered) play('answer');
    previous.current = {
      phase: view.phase,
      players: view.playerCount,
      answered: view.phase === 'question' ? view.answeredCount : 0,
    };
  }, [view, play]);

  const runPrimary = useCallback(() => {
    if (!view) return;
    const action = primaryAction(view);
    if (action.disabled) return;
    if (action.run === 'start') void host.start();
    else if (action.run === 'next') void host.next();
    else if (action.run === 'endQuestion') void host.endQuestion();
    else if (action.run === 'dashboard') navigate('/host');
  }, [view, host, navigate]);

  const toggleLock = useCallback(() => {
    if (view && view.phase !== 'ended') void host.setLocked(!view.locked);
  }, [view, host]);

  const endRace = useCallback(() => {
    if (window.confirm('End the race now? Results so far are saved and everyone sees the final standings.')) {
      void host.end();
    }
  }, [host]);

  const kick = useCallback(
    (player: PlayerPublic) => {
      if (window.confirm(`Remove ${player.nickname} from the race?`)) void host.kick(player.id);
    },
    [host],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      switch (event.key.toLowerCase()) {
        case ' ':
        case 'enter':
          event.preventDefault();
          runPrimary();
          break;
        case 'l':
          toggleLock();
          break;
        case 'm':
          toggleMuted();
          break;
        case 'f':
          toggleFullscreen();
          break;
        case 'e':
          if (view?.phase === 'question') void host.endQuestion();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [runPrimary, toggleLock, toggleMuted, view?.phase, host]);

  if (!host.timed || !view) {
    if (host.connection === 'denied') {
      return (
        <MessageScreen
          icon="lock"
          title="Can’t open this race"
          action={
            <Link to="/host" className="font-pixel text-xs text-sky underline underline-offset-4">
              Back to your quizzes
            </Link>
          }
        >
          {host.error ?? 'This race does not exist anymore.'}
        </MessageScreen>
      );
    }
    return <Spinner className="min-h-dvh" label="Connecting to the race…" />;
  }

  const action = primaryAction(view);
  const timed = host.timed;

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      <header className="race-header flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
        <Logo size="sm" />
        <span className="min-w-0 flex-1 truncate text-lg font-bold">{view.quizTitle}</span>
        {view.phase !== 'lobby' && view.phase !== 'ended' && (
          <span className="font-pixel text-[10px] text-mist">
            {window.location.host}/join · PIN <span className="text-sky-dark">{formatPin(view.pin)}</span>
          </span>
        )}
        <span className="flex items-center gap-2 font-pixel text-xs" title="Racers">
          <Icon name="user" size={1.6} /> {view.playerCount}
        </span>
        <div className="flex items-center">
          {view.phase !== 'ended' && (
            <TopButton
              icon={view.locked ? 'lock' : 'unlock'}
              label={view.locked ? 'Unlock race (L)' : 'Lock race (L)'}
              pressed={view.locked}
              onClick={toggleLock}
            />
          )}
          <TopButton
            icon={sound.muted ? 'mute' : 'speaker'}
            label={sound.muted ? 'Unmute (M)' : 'Mute (M)'}
            pressed={sound.muted}
            onClick={toggleMuted}
          />
          <TopButton icon="fullscreen" label="Fullscreen (F)" onClick={toggleFullscreen} />
          {view.phase !== 'ended' && (
            <Button variant="ghost" size="sm" icon="stop" onClick={endRace}>
              End race
            </Button>
          )}
        </div>
      </header>

      {host.connection === 'offline' && (
        <p role="status" className="bg-flame-soft px-4 py-2 text-center font-bold text-flame-dark">
          Connection lost – reconnecting… The race keeps running on the server.
        </p>
      )}
      {host.error && host.connection !== 'denied' && (
        <div
          role="alert"
          className="flex items-center justify-center gap-4 bg-flame-soft px-4 py-2 font-bold text-flame-dark"
        >
          <span>{host.error}</span>
          <button type="button" onClick={host.clearError} className="underline">
            Dismiss
          </button>
        </div>
      )}

      <main className="live-main relative min-h-0 flex-1 p-4 xl:p-6">
        {view.phase === 'lobby' && <LobbyStage view={view} onKick={kick} />}
        {view.phase === 'countdown' && <CountdownStage timed={timed} />}
        {view.phase === 'question' && <QuestionStage timed={timed} />}
        {view.phase === 'reveal' && (
          <RevealStage
            view={view}
            onHide={(playerId, hidden) => void host.hideAnswer(view.questionIndex, playerId, hidden)}
          />
        )}
        {view.phase === 'scoreboard' && <ScoreboardStage key={view.questionIndex} view={view} />}
        {(view.phase === 'final' || (view.phase === 'ended' && view.final)) && <FinalStage view={view} />}
        {view.phase === 'ended' && !view.final && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <Icon name="flag" size={8} className="text-sun" />
            <p className="font-pixel text-2xl">Race cancelled</p>
            <p className="text-xl text-mist">The race ended before it started.</p>
          </div>
        )}
      </main>

      <footer className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-border bg-panel px-4 py-3">
        <p className="hidden text-sm text-mist lg:block">
          Space: next · E: end question · L: lock · M: mute · F: fullscreen
        </p>
        <div className="ml-auto flex flex-wrap gap-1">
          {view.phase === 'ended' && view.final && (
            <Button
              variant="secondary"
              icon="download"
              onClick={() => navigate(`/host/history/${view.sessionId}`)}
            >
              View results
            </Button>
          )}
          <Button
            size="lg"
            icon={action.icon}
            disabled={action.disabled}
            onClick={runPrimary}
            data-testid="primary-action"
          >
            {action.label}
          </Button>
        </div>
      </footer>
    </div>
  );
}

export function LiveScreenPage() {
  const { sessionId = '' } = useParams();
  return (
    <RequireHost>
      <LiveScreen sessionId={sessionId} />
    </RequireHost>
  );
}
