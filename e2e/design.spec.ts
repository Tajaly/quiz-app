import { expect, test, type Page } from '@playwright/test';
import { createRaceViaApi, joinAsPlayer, mcQuestion, openHostPage, snap } from './helpers';

async function expectNoPageOverflow(page: Page) {
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

async function expectReadableText(page: Page, selector: string, placeholder = false) {
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

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 900, height: 900 },
  { width: 808, height: 854 },
  { width: 390, height: 844 },
  { width: 320, height: 740 },
]) {
  test(`the sunny starting line works at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Ready, set, quiz!' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Join race', exact: true })).toBeVisible();
    const referee = page.getByTestId('dog-referee');
    await expect(referee).toBeVisible();
    const sceneBounds = await page.locator('.race-scene').boundingBox();
    const refereeBounds = await referee.boundingBox();
    if (!sceneBounds || !refereeBounds) throw new Error('Referee or circuit is missing');
    expect(refereeBounds.x).toBeGreaterThanOrEqual(sceneBounds.x);
    expect(refereeBounds.x + refereeBounds.width).toBeLessThanOrEqual(sceneBounds.x + sceneBounds.width);
    expect(refereeBounds.y + refereeBounds.height).toBeLessThanOrEqual(sceneBounds.y + sceneBounds.height);
    await expectNoPageOverflow(page);
    const join = await page.getByRole('button', { name: 'Join race', exact: true }).boundingBox();
    expect(join).not.toBeNull();
    expect((join?.y ?? 0) + (join?.height ?? 0)).toBeLessThanOrEqual(viewport.height);
    expect(join?.height).toBeGreaterThanOrEqual(44);

    await expectReadableText(page, '.landing-copy');
    await expectReadableText(page, '.pin-input input');
    await expectReadableText(page, '.pin-input input', true);
    await expectReadableText(page, 'button[type="submit"]');
    await snap(page, `landing-${viewport.width}`);
  });
}

test('PIN entry keeps visible keyboard focus and clear validation', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const pin = page.getByLabel('Race PIN');
  await expect(pin).toBeFocused();
  const focus = await pin.evaluate((input) => ({
    style: getComputedStyle(input).outlineStyle,
    width: getComputedStyle(input).outlineWidth,
  }));
  expect(focus.style).toBe('solid');
  expect(Number.parseFloat(focus.width)).toBeGreaterThanOrEqual(3);
  await page.getByRole('button', { name: 'Join race', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter the 6-digit PIN shown on the big screen.');
  await expect(pin).toHaveAttribute('aria-invalid', 'true');
  await expectReadableText(page, '[role="alert"]');
});

test('the mobile garage keeps kart choices and the join action usable', async ({ page, browser }) => {
  const host = await openHostPage(browser, '/host');
  const { pin } = await createRaceViaApi(host, [mcQuestion('design-q1', 'Ready to race?', ['Yes', 'No'])]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/join/${pin}`);
  await page.getByLabel('Your racer name').fill('Sunny Racer');
  const models = page.getByRole('radiogroup', { name: 'Kart model' }).getByRole('radio');
  await expect(models).toHaveCount(6);
  await page.getByText('Rocket', { exact: true }).click();
  await expect(models.nth(1)).toBeChecked();
  await models.nth(1).focus();
  await page.keyboard.press('ArrowRight');
  await expect(models.nth(2)).toBeChecked();
  const colors = page.getByRole('radiogroup', { name: 'Kart colour' }).getByRole('radio');
  await expect(colors).toHaveCount(8);
  await page.locator('.garage-swatch').nth(2).click();
  await expect(colors.nth(2)).toBeChecked();
  await colors.nth(2).focus();
  await page.keyboard.press('ArrowRight');
  await expect(colors.nth(3)).toBeChecked();
  await expectNoPageOverflow(page);
  const motion = await page
    .locator('.animate-bob')
    .evaluate((element) => getComputedStyle(element).animationDuration);
  expect(Number.parseFloat(motion)).toBeLessThan(0.01);
  await snap(page, 'mobile-garage');
  await page.setViewportSize({ width: 320, height: 740 });
  await expectNoPageOverflow(page);
  await snap(page, 'mobile-garage-320');
  await page.getByRole('button', { name: 'Join the race' }).click();
  await expect(page.getByText('You’re on the grid!')).toBeVisible();
  await expectNoPageOverflow(page);
  await host.context().close();
});

test('all four pastel answers retain readable text on a small phone', async ({ browser }) => {
  const host = await openHostPage(browser, '/host');
  const { sessionId, pin } = await createRaceViaApi(host, [
    mcQuestion('contrast-q1', 'Pick the finish flag', ['Cone', 'Tire', 'Bolt', 'Flag'], 3),
  ]);
  await host.goto(`/host/live/${sessionId}`);
  const player = await joinAsPlayer(browser, pin, 'Color Racer');
  await player.setViewportSize({ width: 320, height: 740 });
  await host.getByTestId('primary-action').click();
  await expect(player.getByRole('button', { name: 'Flag', exact: true })).toBeVisible();
  for (let index = 1; index <= 4; index += 1) {
    await expectReadableText(player, `.answer-button:nth-child(${index})`);
  }
  await expectNoPageOverflow(player);
  await snap(player, 'mobile-four-answers');
  await player.getByRole('button', { name: 'Flag', exact: true }).click();
  await expect(player.getByText('Correct!', { exact: true })).toBeVisible();
  await player.context().close();
  await host.context().close();
});

test('host tools and the lobby reflow on a narrow screen', async ({ browser }) => {
  const page = await openHostPage(browser, '/host');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Your quizzes' })).toBeVisible();
  await expectNoPageOverflow(page);
  await snap(page, 'mobile-host-dashboard');
  await page.getByRole('button', { name: 'New quiz' }).first().click();
  await expect(page.getByLabel('Title')).toBeVisible();
  await expectNoPageOverflow(page);
  await snap(page, 'mobile-host-editor');

  await page.goto('/host');
  const { sessionId } = await createRaceViaApi(page, [
    mcQuestion('mobile-host-q1', 'A little friendly competition?', ['Always', 'Absolutely']),
  ]);
  await page.goto(`/host/live/${sessionId}`);
  await expect(page.getByTestId('race-pin')).toBeVisible();
  await expectNoPageOverflow(page);
  await snap(page, 'mobile-host-lobby');
  await page.context().close();
});
