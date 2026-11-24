import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { devices, expect, type Browser, type Page } from '@playwright/test';

export async function expectNoPageOverflow(page: Page) {
  const size = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(size.content).toBeLessThanOrEqual(size.viewport);
}

function luminance(color: string) {
  const channels = color
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  if (!channels || channels.length !== 3) throw new Error(`Unexpected computed color: ${color}`);
  const [red = 0, green = 0, blue = 0] = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

export async function expectReadableText(page: Page, selector: string, placeholder = false) {
  const colors = await page
    .locator(selector)
    .first()
    .evaluate((element, usePlaceholder) => {
      let ancestor: Element | null = element;
      let background = 'rgb(255, 255, 255)';
      while (ancestor) {
        const candidate = getComputedStyle(ancestor).backgroundColor;
        if (candidate !== 'rgba(0, 0, 0, 0)' && candidate !== 'transparent') {
          background = candidate;
          break;
        }
        ancestor = ancestor.parentElement;
      }
      return {
        foreground: getComputedStyle(element, usePlaceholder ? '::placeholder' : null).color,
        background,
      };
    }, placeholder);
  const values = [luminance(colors.foreground), luminance(colors.background)].sort((a, b) => b - a);
  const ratio = ((values[0] ?? 0) + 0.05) / ((values[1] ?? 0) + 0.05);
  expect(ratio, `${selector} contrast`).toBeGreaterThanOrEqual(4.5);
}

/** Set E2E_SCREENSHOTS_DIR to capture screenshots of key moments (used for docs and visual review). */
export async function snap(page: Page, name: string): Promise<void> {
  const dir = process.env.E2E_SCREENSHOTS_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  if (await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 1)) {
    await page.screenshot({ path: path.join(dir, `${name}-viewport.png`), animations: 'disabled' });
  }
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true, animations: 'disabled' });
}

export async function openHostPage(browser: Browser, url: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
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
  host: Page,
  questions: unknown[],
  title = 'API Grand Prix',
): Promise<{ sessionId: string; pin: string }> {
  await expect(host.getByRole('heading', { name: 'Your quizzes' })).toBeVisible();
  const token = await host.evaluate(() => localStorage.getItem('pq:guestHost'));
  if (!token) throw new Error('The browser did not create a guest host key');
  const hostHeaders = { Authorization: `Bearer ${token}` };
  const request = host.request;
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
