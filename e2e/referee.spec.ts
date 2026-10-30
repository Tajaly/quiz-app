import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

test('the pixel referee has distinct, short flag, tail and blink movements', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const referee = page.getByTestId('dog-referee');
  await expect(referee).toBeVisible();
  await expect(referee).toHaveAttribute('aria-label', 'Dog referee with a chequered finish flag');

  const motions = await referee.evaluate((svg) =>
    [...svg.querySelectorAll<SVGGElement>('.dog-referee__flag, .dog-referee__tail, .dog-referee__eyes')].map(
      (part) => {
        part.style.animation = 'none';
        part.getBoundingClientRect();
        part.style.removeProperty('animation');
        const animation = part.getAnimations()[0];
        if (!animation?.effect) throw new Error('Referee motion did not start');
        const timing = animation.effect.getTiming();
        if (typeof timing.duration !== 'number') throw new Error('Referee motion must have a fixed duration');
        if (typeof timing.iterations !== 'number' || !Number.isFinite(timing.iterations)) {
          throw new Error('Referee motion must stop after a finite number of repeats');
        }
        animation.pause();
        animation.currentTime = 0;
        const start = getComputedStyle(part).transform;
        animation.currentTime = timing.duration * (part.classList.contains('dog-referee__eyes') ? 0.76 : 0.5);
        const moved = getComputedStyle(part).transform;
        animation.finish();
        return { start, moved, duration: timing.duration, iterations: timing.iterations };
      },
    ),
  );
  expect(motions).toHaveLength(3);
  for (const motion of motions) {
    expect(motion.moved).not.toBe(motion.start);
    expect(motion.duration * motion.iterations).toBeLessThanOrEqual(3000);
    expect(motion.iterations).toBeGreaterThan(0);
  }
});

test('reduced motion keeps the dog and flag visible without movement', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const referee = page.getByTestId('dog-referee');
  await expect(referee).toBeVisible();
  for (const part of ['flag', 'tail', 'eyes']) {
    await expect(referee.locator(`.dog-referee__${part}`)).toHaveCSS('animation-name', 'none');
  }
  expect(await referee.evaluate((svg) => svg.getAnimations({ subtree: true }).length)).toBe(0);
});

test('the referee remains crisp and recognizable at portrait scale', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 3,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto('/');
  const referee = page.getByTestId('dog-referee');
  await expect(referee).toHaveAttribute('viewBox', '0 0 76 64');
  await expect(referee).toHaveCSS('image-rendering', 'pixelated');
  await page.evaluate(() => document.fonts.ready);
  const dir = process.env.E2E_SCREENSHOTS_DIR;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    await referee.screenshot({ path: path.join(dir, 'dog-referee.png'), animations: 'disabled' });
  }
  await context.close();
});
