import { useMemo } from 'react';
import type {
  JoinInfo,
  LiveSessionSummary,
  Quiz,
  QuizInput,
  QuizSummary,
  SessionDetail,
  SessionSummary,
  StartSessionResponse,
} from '@power-quiz/shared';
import { useAuth } from '../auth/AuthProvider';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: Array<{ path: string; message: string }> = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function parseError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    issues?: Array<{ path: string; message: string }>;
  };
  return new ApiError(response.status, body.error ?? `Request failed (${response.status})`, body.issues);
}

export async function fetchJoinInfo(pin: string): Promise<JoinInfo> {
  const response = await fetch(`/api/live/${encodeURIComponent(pin)}`);
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as JoinInfo;
}

export function createApi(getToken: () => Promise<string>) {
  async function send(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = { Authorization: `Bearer ${await getToken()}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw await parseError(response);
    return response;
  }

  async function json<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await send(method, path, body);
    return (response.status === 204 ? undefined : await response.json()) as T;
  }

  return {
    listQuizzes: () => json<QuizSummary[]>('GET', '/api/quizzes'),
    getQuiz: (id: string) => json<Quiz>('GET', `/api/quizzes/${id}`),
    createQuiz: (input: QuizInput) => json<Quiz>('POST', '/api/quizzes', input),
    updateQuiz: (id: string, input: QuizInput) => json<Quiz>('PUT', `/api/quizzes/${id}`, input),
    deleteQuiz: (id: string) => json<void>('DELETE', `/api/quizzes/${id}`),
    duplicateQuiz: (id: string) => json<Quiz>('POST', `/api/quizzes/${id}/duplicate`),
    startSession: (quizId: string) => json<StartSessionResponse>('POST', '/api/sessions', { quizId }),
    listLiveSessions: () => json<LiveSessionSummary[]>('GET', '/api/sessions/live'),
    listSessions: () => json<SessionSummary[]>('GET', '/api/sessions'),
    getSession: (id: string) => json<SessionDetail>('GET', `/api/sessions/${id}`),
    deleteSession: (id: string) => json<void>('DELETE', `/api/sessions/${id}`),
    async downloadResultsCsv(id: string): Promise<void> {
      const response = await send('GET', `/api/sessions/${id}/results.csv`);
      const disposition = response.headers.get('Content-Disposition') ?? '';
      const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? 'power-quiz-results.csv';
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };
}

export type Api = ReturnType<typeof createApi>;

export function useApi(): Api {
  const { getToken } = useAuth();
  return useMemo(() => createApi(getToken), [getToken]);
}
