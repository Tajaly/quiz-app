import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QuizInput } from '@power-quiz/shared';
import { useApi } from './api';

export const queryKeys = {
  quizzes: ['quizzes'] as const,
  quiz: (id: string) => ['quizzes', id] as const,
  liveSessions: ['sessions', 'live'] as const,
  sessions: ['sessions', 'history'] as const,
  session: (id: string) => ['sessions', 'history', id] as const,
};

export function useQuizzes() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.quizzes, queryFn: api.listQuizzes });
}

export function useQuiz(id: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.quiz(id ?? 'new'),
    queryFn: () => api.getQuiz(id ?? ''),
    enabled: !!id,
  });
}

export function useSaveQuiz() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: QuizInput }) =>
      id ? api.updateQuiz(id, input) : api.createQuiz(input),
    onSuccess: (quiz) => {
      client.setQueryData(queryKeys.quiz(quiz.id), quiz);
      void client.invalidateQueries({ queryKey: queryKeys.quizzes, exact: true });
    },
  });
}

export function useDeleteQuiz() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteQuiz(id),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.quizzes, exact: true }),
  });
}

export function useDuplicateQuiz() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.duplicateQuiz(id),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.quizzes, exact: true }),
  });
}

export function useStartSession() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (quizId: string) => api.startSession(quizId),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.liveSessions }),
  });
}

export function useLiveSessions() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.liveSessions,
    queryFn: api.listLiveSessions,
    refetchInterval: 10_000,
  });
}

export function useSessionHistory() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.sessions, queryFn: api.listSessions });
}

export function useSessionDetail(id: string) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.session(id), queryFn: () => api.getSession(id) });
}

export function useDeleteSession() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteSession(id),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.sessions }),
  });
}
