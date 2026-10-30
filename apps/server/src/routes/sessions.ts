import { Router } from 'express';
import {
  idSchema,
  startSessionSchema,
  type SessionDetail,
  type StartSessionResponse,
} from '@power-quiz/shared';
import { currentUser } from '../auth/authenticator';
import { buildResultsCsv } from '../csv';
import type { SessionManager } from '../game/SessionManager';
import type { Repositories } from '../repositories/types';

export function sessionRoutes(repos: Repositories, manager: SessionManager): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const user = currentUser(res);
    const { quizId } = startSessionSchema.parse(req.body);
    const quiz = await repos.quizzes.get(user.id, quizId);
    if (!quiz) {
      res.status(404).json({ error: 'Quiz not found.' });
      return;
    }
    const session = manager.create(user.id, quiz);
    const body: StartSessionResponse = { sessionId: session.id, pin: session.pin };
    res.status(201).json(body);
  });

  router.get('/live', (_req, res) => {
    res.json(manager.listForOwner(currentUser(res).id));
  });

  router.get('/', async (_req, res) => {
    res.json(await repos.sessions.listSessions(currentUser(res).id));
  });

  const loadDetail = async (ownerId: string, rawId: string): Promise<SessionDetail | null> => {
    const id = idSchema.parse(rawId);
    const session = await repos.sessions.getSession(ownerId, id);
    if (!session) return null;
    return { session, answers: await repos.sessions.listQuestionAnswers(id) };
  };

  router.get('/:id', async (req, res) => {
    const detail = await loadDetail(currentUser(res).id, req.params.id);
    if (!detail) {
      res.status(404).json({ error: 'Race results not found.' });
      return;
    }
    res.json(detail);
  });

  router.get('/:id/results.csv', async (req, res) => {
    const detail = await loadDetail(currentUser(res).id, req.params.id);
    if (!detail) {
      res.status(404).json({ error: 'Race results not found.' });
      return;
    }
    const slug =
      detail.session.quizTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'race';
    const date = detail.session.startedAt.slice(0, 10);
    res.attachment(`power-quiz-${slug}-${date}.csv`);
    res.type('text/csv; charset=utf-8');
    res.send(buildResultsCsv(detail));
  });

  router.delete('/:id', async (req, res) => {
    const deleted = await repos.sessions.deleteSession(currentUser(res).id, idSchema.parse(req.params.id));
    if (!deleted) {
      res.status(404).json({ error: 'Race results not found.' });
      return;
    }
    res.status(204).end();
  });

  return router;
}
