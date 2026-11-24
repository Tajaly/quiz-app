import { expect, test, type Page } from '@playwright/test';
import {
  createRaceViaApi,
  expectNoPageOverflow as expectNoOverflow,
  expectReadableText as expectReadable,
  joinAsPlayer,
  mcQuestion,
  openHostPage,
  snap,
} from './helpers';

async function expectTheme(page: Page, theme: 'light' | 'dark') {
  await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    theme === 'dark' ? 'rgb(16, 29, 43)' : 'rgb(237, 248, 255)',
  );
}

test('system appearance, manual overrides, persistence and cross-tab synchronization', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.getByLabel('Colour theme')).toHaveValue('system');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(16, 29, 43)');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(237, 248, 255)');

  await page.getByLabel('Colour theme').selectOption('dark');
  await expectTheme(page, 'dark');
  await page.reload();
  await expect(page.getByLabel('Colour theme')).toHaveValue('dark');
  await expectTheme(page, 'dark');

  const other = await page.context().newPage();
  await other.goto('/join');
  await expect(other.getByLabel('Colour theme')).toHaveValue('dark');
  await other.getByLabel('Colour theme').selectOption('light');
  await expectTheme(page, 'light');
  await expect(page.getByLabel('Colour theme')).toHaveValue('light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expectTheme(page, 'light');
  await other.getByLabel('Colour theme').selectOption('system');
  await expect(page.getByLabel('Colour theme')).toHaveValue('system');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(16, 29, 43)');
  await other.close();
});

test('saved appearance is applied even before the React bundle loads', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Colour theme').selectOption('dark');
  await page.route('**/assets/*.js', (route) => route.abort());
  await page.reload();
  await expectTheme(page, 'dark');
  await expect(page.locator('#root')).toBeEmpty();
});

test('blocked storage keeps the app and theme control usable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Storage blocked', 'SecurityError');
      },
    });
  });
  await page.goto('/');
  await page.getByLabel('Colour theme').selectOption('dark');
  await expectTheme(page, 'dark');
  await expect(page.getByRole('status')).toContainText('could not be saved');
});

for (const width of [1440, 390, 320]) {
  test(`dark starting line is readable and usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.getByLabel('Colour theme').selectOption('dark');
    await expectTheme(page, 'dark');
    await expectNoOverflow(page);
    for (const selector of [
      '.landing-copy',
      '.landing-footer',
      '.pin-input input',
      'button[type="submit"]',
      'select',
    ]) {
      await expectReadable(page, selector);
    }
    await expectReadable(page, '.pin-input input', true);
    await page.getByRole('button', { name: 'Join race', exact: true }).click();
    await expectReadable(page, '[role="alert"]');
    await snap(page, `dark-landing-${width}`);
  });
}

test('dark mode covers the host editor, live race, phone answers and results', async ({ browser }) => {
  const host = await openHostPage(browser, '/host');
  await host.getByLabel('Colour theme').selectOption('dark');
  await host.setViewportSize({ width: 390, height: 844 });
  await expectNoOverflow(host);
  await host.getByRole('button', { name: 'New quiz' }).first().click();
  await expect(host.getByLabel('Title')).toBeVisible();
  await expectTheme(host, 'dark');
  await expectReadable(host, 'input');
  await expectNoOverflow(host);
  await snap(host, 'dark-editor-mobile');

  await host.goto('/host');
  const { sessionId, pin } = await createRaceViaApi(host, [
    mcQuestion('dark-q1', 'Pick the finish flag', ['Cone', 'Tire', 'Bolt', 'Flag'], 3, 120),
  ]);
  await host.goto(`/host/live/${sessionId}`);
  await expect(host.getByTestId('race-pin')).toBeVisible();
  await expectTheme(host, 'dark');
  await expectNoOverflow(host);
  await expect(host.locator('svg').filter({ has: host.locator('path[fill="#19354d"]') })).toHaveCount(1);
  await snap(host, 'dark-lobby-mobile');
  await host.setViewportSize({ width: 1440, height: 900 });
  await snap(host, 'dark-lobby-desktop');

  const player = await joinAsPlayer(browser, pin, 'Night Racer');
  await player.getByLabel('Colour theme').selectOption('dark');
  await player.setViewportSize({ width: 320, height: 740 });
  await expectNoOverflow(player);
  await host.getByTestId('primary-action').click();
  await expect(player.getByRole('button', { name: 'Flag', exact: true })).toBeVisible();
  for (let index = 1; index <= 4; index += 1) {
    await expectReadable(player, `.answer-button:nth-child(${index})`);
  }
  await expectNoOverflow(player);
  await snap(player, 'dark-player-answers');
  await player.getByRole('button', { name: 'Flag', exact: true }).click();
  await player.getByRole('button', { name: 'Submit answer' }).click();
  await expect(player.getByText('Correct!', { exact: true })).toBeVisible();
  await expectReadable(player, '.bg-lime');
  await snap(player, 'dark-player-correct');
  await host.getByTestId('primary-action').click();
  await host.getByTestId('primary-action').click();
  await expect(host.getByTestId('podium-1')).toBeVisible();
  await expectReadable(host, '.podium-block');
  await snap(host, 'dark-podium');
  await player.context().close();
  await host.context().close();
});
