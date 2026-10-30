import { lazy, Suspense, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AuthProvider } from './auth/AuthProvider';
import { Spinner } from './design/Widgets';
import { Landing } from './features/landing/Landing';
import { NotFound, RouteError } from './features/landing/NotFound';
import { PlayerPage } from './features/player/PlayerPage';
import { ApiError } from './lib/api';

// Host screens are split out so participants' phones only download what they need.
const HostLayout = lazy(() => import('./features/host/HostLayout').then((m) => ({ default: m.HostLayout })));
const Dashboard = lazy(() => import('./features/host/Dashboard').then((m) => ({ default: m.Dashboard })));
const QuizEditorPage = lazy(() =>
  import('./features/host/QuizEditor').then((m) => ({ default: m.QuizEditorPage })),
);
const HistoryPage = lazy(() => import('./features/host/History').then((m) => ({ default: m.HistoryPage })));
const SessionResultsPage = lazy(() =>
  import('./features/host/SessionResults').then((m) => ({ default: m.SessionResultsPage })),
);
const LiveScreenPage = lazy(() =>
  import('./features/host/live/LiveScreen').then((m) => ({ default: m.LiveScreenPage })),
);

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Spinner className="min-h-[50vh]" />}>{children}</Suspense>;
}

const router = createBrowserRouter([
  { path: '/', element: <Landing />, errorElement: <RouteError /> },
  { path: '/join', element: <PlayerPage />, errorElement: <RouteError /> },
  { path: '/join/:pin', element: <PlayerPage />, errorElement: <RouteError /> },
  {
    path: '/host',
    element: (
      <Lazy>
        <HostLayout />
      </Lazy>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'quizzes/new', element: <QuizEditorPage /> },
      { path: 'quizzes/:quizId', element: <QuizEditorPage /> },
      { path: 'history', element: <HistoryPage /> },
      { path: 'history/:sessionId', element: <SessionResultsPage /> },
    ],
  },
  {
    path: '/host/live/:sessionId',
    element: (
      <Lazy>
        <LiveScreenPage />
      </Lazy>
    ),
    errorElement: <RouteError />,
  },
  { path: '*', element: <NotFound /> },
]);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 2,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
