import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { devices, expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';

export const HOST_NAME = 'Quiz Master';
export const hostHeaders = { Authorization: `Bearer dev:${encodeURIComponent(HOST_NAME)}` };

/** Set E2E_SCREENSHOTS_DIR to capture screenshots of key moments (used for docs and visual review). */
export async function snap(page: Page, name: string): Promise<void> {
  const dir = process.env.E2E_SCREENSHOTS_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(dir, `${name}.png`) });
}

export async function openHostPage(browser: Browser, url: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await context.addInitScript((name) => localStorage.setItem('pq:devUser', name), HOST_NAME);
  const page = await context.newPage();
  await page.goto(url);
  return page;
}

export async function joinAsPlayer(browser: Browser, pin: string, nickname: string): Promise<Page> {
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await context.newPage();
  await page.goto(`/join/${pin}`);
  await page.getByLabel('Your racer name').fill(nickname);
  await page.getByRole('button', { name: 'Join the race' }).click();
  await expect(page.getByText('You’re on the grid!')).toBeVisible();
  return page;
}

export async function createRaceViaApi(
  request: APIRequestContext,
  questions: unknown[],
  title = 'API Grand Prix',
): Promise<{ sessionId: string; pin: string }> {
  const quiz = await request.post('/api/quizzes', { headers: hostHeaders, data: { title, questions } });
  expect(quiz.ok()).toBeTruthy();
  const { id } = (await quiz.json()) as { id: string };
  const session = await request.post('/api/sessions', { headers: hostHeaders, data: { quizId: id } });
  expect(session.ok()).toBeTruthy();
  return (await session.json()) as { sessionId: string; pin: string };
}

export const mcQuestion = (id: string, text: string, options: string[], correct = 0, timeLimitSec = 30) => ({
  id,
  type: 'mc',
  text,
  options: options.map((option, index) => ({ id: `${id}o${index}`, text: option })),
  correctOptionId: `${id}o${correct}`,
  timeLimitSec,
});
