import { expect, test } from '@playwright/test';
import { createRaceViaApi, joinAsPlayer, mcQuestion, openHostPage, snap } from './helpers';

test('a host builds a quiz and runs a full race with three phones', async ({ browser }) => {
  const host = await openHostPage(browser, '/');
  await snap(host, '01-landing');

  // Build a quiz in the editor.
  await host.getByRole('button', { name: 'Host a quiz' }).click();
  await expect(host.getByRole('heading', { name: 'Your quizzes' })).toBeVisible();
  await host.getByRole('button', { name: 'New quiz' }).first().click();
  await host.getByLabel('Title').fill('E2E Grand Prix');
  await host.getByLabel('Question', { exact: true }).fill('Capital of France?');
  await host.getByLabel('Answer A', { exact: true }).fill('Paris');
  await host.getByLabel('Answer B', { exact: true }).fill('Rome');
  await host.getByLabel('Answer C', { exact: true }).fill('Berlin');
  await host.getByRole('button', { name: 'Open question' }).click();
  await host.getByLabel('Question', { exact: true }).nth(1).fill('Favourite racing colour?');
  await snap(host, '02-editor');
  await host.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(host.getByText('Quiz saved!')).toBeVisible();

  // Start the race and let three phones join with the PIN.
  await host.getByRole('button', { name: 'Start race' }).click();
  await expect(host).toHaveURL(/\/host\/live\//);
  const pin = ((await host.getByTestId('race-pin').textContent()) ?? '').replace(/\D/g, '');
  expect(pin).toMatch(/^\d{6}$/);

  const [ann, ben, cat] = await Promise.all(
    ['Ann', 'Ben', 'Cat'].map((name) => joinAsPlayer(browser, pin, name)),
  );
  if (!ann || !ben || !cat) throw new Error('players missing');
  await expect(host.getByTestId('racer-count')).toHaveText('3 racers');
  await snap(host, '03-host-lobby');
  await snap(ann, '04-phone-lobby');

  // Question 1 – multiple choice.
  await host.getByTestId('primary-action').click();
  await expect(host.getByTestId('primary-action')).toHaveText(/Get ready/);
  await expect(host.getByTestId('dog-referee')).toHaveAttribute('data-pose', 'idle');
  await snap(host, '05-host-countdown');
  for (const phone of [ann, ben, cat])
    await expect(phone.getByRole('button', { name: 'Paris' })).toBeVisible();
  await snap(host, '06-host-question');
  await snap(ann, '07-phone-question');
  await ann.getByRole('button', { name: 'Paris' }).click();
  await ben.getByRole('button', { name: 'Rome' }).click();
  await cat.getByRole('button', { name: 'Paris' }).click();

  await expect(host.locator('[data-correct="true"]')).toContainText('Paris');
  await expect(ann.getByText('Correct!')).toBeVisible();
  await expect(ben.getByText('Not this time')).toBeVisible();
  await snap(host, '08-host-reveal');
  await snap(ann, '09-phone-correct');
  await snap(ben, '10-phone-wrong');

  await host.getByTestId('primary-action').click();
  await expect(host.getByTestId('standing')).toHaveCount(3);
  await snap(host, '11-host-standings');

  // Question 2 – open answers appear with nicknames.
  await host.getByTestId('primary-action').click();
  const answers = ['Racing red', 'Electric blue', 'Lime green'];
  for (const [index, phone] of [ann, ben, cat].entries()) {
    await phone.getByLabel('Your answer').fill(answers[index] ?? '');
    await phone.getByRole('button', { name: 'Send answer' }).click();
  }
  await expect(host.getByText('Electric blue')).toBeVisible();
  await snap(host, '12-host-open-answers');

  // Final podium and hitlist.
  await host.getByTestId('primary-action').click();
  await expect(host.getByTestId('podium-1')).toContainText('Ann');
  await expect(host.getByTestId('dog-referee')).toHaveAttribute('data-pose', 'finish');
  await expect(host.locator('.dog-referee__flag')).toHaveCSS('animation-name', 'pq-referee-finish');
  await expect(ben.getByText('3rd', { exact: true })).toBeVisible();
  await host.waitForTimeout(3000);
  await snap(host, '13-host-podium');
  await snap(ann, '14-phone-final');

  await host.getByTestId('primary-action').click();
  await host.getByRole('button', { name: 'View results' }).click();
  await expect(host.getByRole('heading', { name: 'E2E Grand Prix' })).toBeVisible();
  await expect(host.getByText('Lime green')).toBeVisible();
  await snap(host, '15-host-results');
});

test('a player who reloads mid-race keeps their name, kart and score', async ({ browser }) => {
  const host = await openHostPage(browser, '/host');
  const { sessionId, pin } = await createRaceViaApi(host, [
    mcQuestion('q1', 'Pick the bolt', ['Bolt', 'Cone']),
    mcQuestion('q2', 'Pick the cone', ['Bolt', 'Cone'], 1),
  ]);
  await host.goto(`/host/live/${sessionId}`);
  const zoe = await joinAsPlayer(browser, pin, 'Zoe');
  await expect(host.getByTestId('racer-count')).toHaveText('1 racer');
  await host.getByTestId('primary-action').click();
  await zoe.getByRole('button', { name: 'Bolt' }).click();
  await expect(zoe.getByText('Correct!')).toBeVisible();

  await zoe.reload();
  await expect(zoe.getByText('Correct!')).toBeVisible();
  await expect(zoe.getByText('Zoe', { exact: true })).toBeVisible();
  await expect(zoe.locator('header')).toContainText(/[1-9]\d{2}/);
});

test('a locked race turns late racers away until it is unlocked', async ({ browser }) => {
  const host = await openHostPage(browser, '/host');
  const { sessionId, pin } = await createRaceViaApi(host, [mcQuestion('q1', 'Ready?', ['Yes', 'No'])]);
  await host.goto(`/host/live/${sessionId}`);
  await expect(host.getByText('Waiting for racers…')).toBeVisible();
  await host.getByRole('button', { name: 'Lock race (L)' }).click();
  await expect(host.getByText('Race locked – nobody new can join.')).toBeVisible();

  const late = await browser.newPage();
  await late.goto(`/join/${pin}`);
  await expect(late.getByText('Race locked')).toBeVisible();

  await host.getByRole('button', { name: 'Unlock race (L)' }).click();
  await expect(host.getByText('Race locked – nobody new can join.')).toBeHidden();
  await joinAsPlayer(browser, pin, 'Latecomer');
  await expect(host.getByText('Latecomer')).toBeVisible();
});
