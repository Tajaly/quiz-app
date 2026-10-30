import { expect, test, type Page } from '@playwright/test';
import { createRaceViaApi, mcQuestion, openHostPage, snap } from './helpers';

for (const [name, viewport] of [
  ['desktop', { width: 1440, height: 1000 }],
  ['mobile', { width: 390, height: 844 }],
] as const) {
  test(`guest hosting opens without sign-in on ${name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    expect(await page.evaluate(() => localStorage.getItem('pq:guestHost'))).toBeNull();
    await snap(page, `guest-${name}-landing`);
    await page.getByRole('button', { name: 'Host a quiz' }).click();
    await expect(page.getByRole('heading', { name: 'Your quizzes' })).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in|sign out/i })).toHaveCount(0);
    await expect(page.getByLabel('Your name', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/Clearing site data removes your private host key/)).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('pq:guestHost'))).toMatch(/^guest:[a-f0-9]{64}$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await snap(page, `guest-${name}-dashboard`);
  });
}

test('simultaneous first visits in two tabs share one host key', async ({ context }) => {
  const first = await context.newPage();
  const second = await context.newPage();
  await Promise.all([first.goto('/host'), second.goto('/host')]);
  await expect(first.getByRole('heading', { name: 'Your quizzes' })).toBeVisible();
  await expect(second.getByRole('heading', { name: 'Your quizzes' })).toBeVisible();
  const keys = await Promise.all(
    [first, second].map((page) => page.evaluate(() => localStorage.getItem('pq:guestHost'))),
  );
  expect(keys[0]).toMatch(/^guest:[a-f0-9]{64}$/);
  expect(keys[1]).toBe(keys[0]);
});

test('tabs racing to create a key without Web Locks still converge on one host', async ({ context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
    const random = crypto.getRandomValues.bind(crypto);
    let delayed = false;
    Object.defineProperty(crypto, 'getRandomValues', {
      configurable: true,
      value: (array: Uint8Array<ArrayBuffer>) => {
        if (!delayed && array.byteLength === 32) {
          delayed = true;
          const until = performance.now() + 500;
          while (performance.now() < until) {
            // Busy-wait so both tabs read an empty store before either saves its new key.
          }
        }
        return random(array);
      },
    });
  });
  const [first, second] = await Promise.all([context.newPage(), context.newPage()]);
  await Promise.all([first.goto('/host'), second.goto('/host')]);
  await expect(first.getByRole('heading', { name: 'Your quizzes' })).toBeVisible();
  await expect(second.getByRole('heading', { name: 'Your quizzes' })).toBeVisible();
  const storedKey = (page: Page) => page.evaluate(() => localStorage.getItem('pq:guestHost'));
  await expect.poll(async () => (await storedKey(first)) === (await storedKey(second))).toBe(true);

  await first.getByRole('button', { name: 'Add sample quiz', exact: true }).first().click();
  const sample = (page: Page) => page.getByRole('heading', { name: 'Pixel Grand Prix warm-up', exact: true });
  await expect(sample(first)).toBeVisible();
  const nav = second.getByRole('navigation', { name: 'Host' });
  await nav.getByRole('link', { name: 'Past races' }).click();
  await expect(second.getByRole('heading', { name: 'Past races' })).toBeVisible();
  await nav.getByRole('link', { name: 'Quizzes' }).click();
  await expect(sample(second)).toBeVisible();
});

test('guest quizzes and race controls survive reloads, new tabs and a restored browser profile', async ({
  browser,
}) => {
  const host = await openHostPage(browser, '/host');
  const { sessionId, pin } = await createRaceViaApi(
    host,
    [mcQuestion('q1', 'Keep this quiz?', ['Yes', 'No'])],
    'My browser quiz',
  );
  await host.reload();
  await expect(host.getByRole('heading', { name: 'My browser quiz' })).toBeVisible();
  const key = await host.evaluate(() => localStorage.getItem('pq:guestHost'));

  const tab = await host.context().newPage();
  await tab.goto(`/host/live/${sessionId}`);
  await expect(tab.getByTestId('race-pin')).toContainText(pin.slice(0, 3));
  await tab.reload();
  await expect(tab.getByTestId('race-pin')).toBeVisible();
  expect(await tab.evaluate(() => localStorage.getItem('pq:guestHost'))).toBe(key);

  const storageState = await host.context().storageState();
  await host.context().close();
  const restored = await browser.newContext({ storageState });
  const again = await restored.newPage();
  await again.goto('/host');
  await expect(again.getByRole('heading', { name: 'My browser quiz' })).toBeVisible();
  expect(await again.evaluate(() => localStorage.getItem('pq:guestHost'))).toBe(key);
  await restored.close();
});

test('another browser cannot use a race link or PIN to take over a guest race', async ({ browser }) => {
  const host = await openHostPage(browser, '/host');
  const { sessionId } = await createRaceViaApi(host, [mcQuestion('q1', 'Private race?', ['Yes', 'No'])]);
  const other = await openHostPage(browser, `/host/live/${sessionId}`);
  await expect(other.getByText('This is not your race.')).toBeVisible();
  await expect(other.getByTestId('primary-action')).toHaveCount(0);
  await other.goto('/host');
  await expect(other.getByText('The garage is empty')).toBeVisible();
  await other.context().close();
  await host.context().close();
});

test('a guest can add, reopen and run the original sample quiz', async ({ page, browser }) => {
  await page.goto('/host');
  await page.getByRole('button', { name: 'Add sample quiz', exact: true }).first().click();
  const card = page.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: 'Pixel Grand Prix warm-up', exact: true }),
  });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('8 questions');
  await page.reload();
  await expect(card).toBeVisible();
  await snap(page, 'guest-sample-dashboard');
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Pixel Grand Prix warm-up');
  await expect(page.getByLabel('Question', { exact: true })).toHaveCount(8);
  await expect(page.getByLabel('Question', { exact: true }).first()).toHaveValue(
    'Which planet is known as the Red Planet?',
  );
  await page.getByRole('button', { name: 'Start race', exact: true }).click();
  await expect(page.getByTestId('race-pin')).toBeVisible();

  const otherHost = await openHostPage(browser, '/host');
  await expect(otherHost.getByRole('heading', { name: 'Pixel Grand Prix warm-up', exact: true })).toHaveCount(
    0,
  );
  await otherHost.context().close();
});

test('blocked browser storage shows a recoverable error instead of a sign-in form', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Storage blocked', 'SecurityError');
      },
    });
  });
  await page.goto('/host');
  await expect(page.getByRole('alert')).toContainText('Allow site storage and try again.');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your quizzes' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /sign in/i })).toHaveCount(0);
});
