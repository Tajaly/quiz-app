import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { LIMITS, idSchema, quizInputSchema, type Quiz } from '@power-quiz/shared';
import { currentUser } from '../auth/authenticator';
import type { Repositories } from '../repositories/types';

export function quizRoutes(repos: Repositories): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json(await repos.quizzes.list(currentUser(res).id));
  });

  router.post('/', async (req, res) => {
    const user = currentUser(res);
    const input = quizInputSchema.parse(req.body);
    const now = new Date().toISOString();
    const quiz: Quiz = { ...input, id: randomUUID(), ownerId: user.id, createdAt: now, updatedAt: now };
    res.status(201).json(await repos.quizzes.save(quiz));
  });

  router.get('/:id', async (req, res) => {
    const quiz = await repos.quizzes.get(currentUser(res).id, idSchema.parse(req.params.id));
    if (!quiz) {
      res.status(404).json({ error: 'Quiz not found.' });
      return;
    }
    res.json(quiz);
  });

  router.put('/:id', async (req, res) => {
    const user = currentUser(res);
    const id = idSchema.parse(req.params.id);
    const existing = await repos.quizzes.get(user.id, id);
    if (!existing) {
      res.status(404).json({ error: 'Quiz not found.' });
      return;
    }
    const input = quizInputSchema.parse(req.body);
    const quiz: Quiz = {
      ...input,
      id,
      ownerId: user.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    res.json(await repos.quizzes.save(quiz));
  });

  router.delete('/:id', async (req, res) => {
    const deleted = await repos.quizzes.delete(currentUser(res).id, idSchema.parse(req.params.id));
    if (!deleted) {
      res.status(404).json({ error: 'Quiz not found.' });
      return;
    }
    res.status(204).end();
  });

  router.post('/:id/duplicate', async (req, res) => {
    const user = currentUser(res);
    const original = await repos.quizzes.get(user.id, idSchema.parse(req.params.id));
    if (!original) {
      res.status(404).json({ error: 'Quiz not found.' });
      return;
    }
    const now = new Date().toISOString();
    const copy: Quiz = {
      ...structuredClone(original),
      id: randomUUID(),
      title: `Copy of ${original.title}`.slice(0, LIMITS.quizTitleMax),
      createdAt: now,
      updatedAt: now,
    };
    res.status(201).json(await repos.quizzes.save(copy));
  });

  return router;
}
