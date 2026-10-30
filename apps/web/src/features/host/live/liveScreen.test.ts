import { describe, expect, it } from 'vitest';
import type { HostView } from '@power-quiz/shared';
import { formatPin, ordinal, percent } from '../../../lib/format';
import { primaryAction } from './LiveScreen';

function view(overrides: Partial<HostView>): HostView {
  return {
    sessionId: 's',
    pin: '123456',
    quizTitle: 'Quiz',
    phase: 'lobby',
    locked: false,
    questionIndex: 0,
    questionCount: 3,
    playerCount: 2,
    connectedCount: 2,
    players: [],
    question: null,
    countdown: null,
    timer: null,
    answeredCount: 0,
    reveal: null,
    scoreboard: null,
    final: null,
    ...overrides,
  };
}

describe('primaryAction', () => {
  it('waits for racers before the race can start', () => {
    expect(primaryAction(view({ playerCount: 0 }))).toMatchObject({ disabled: true });
    expect(primaryAction(view({}))).toMatchObject({ label: 'Start race', run: 'start' });
  });

  it('shows standings after multiple-choice questions and skips them after open ones', () => {
    const mc = { index: 0, id: 'q', type: 'mc' as const, text: 'x', options: [], timeLimitSec: 20 };
    expect(primaryAction(view({ phase: 'reveal', question: mc })).label).toBe('Standings');
    expect(
      primaryAction(view({ phase: 'reveal', question: { ...mc, type: 'open', options: null } })).label,
    ).toBe('Next question');
  });

  it('leads to the final results after the last question', () => {
    expect(primaryAction(view({ phase: 'scoreboard', questionIndex: 2 }))).toMatchObject({
      label: 'Final results',
      run: 'next',
    });
    expect(primaryAction(view({ phase: 'question' }))).toMatchObject({ run: 'endQuestion' });
    expect(primaryAction(view({ phase: 'ended' }))).toMatchObject({ run: 'dashboard' });
  });
});

describe('format helpers', () => {
  it('formats ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '101st',
      '111th',
    ]);
  });

  it('formats PINs and percentages', () => {
    expect(formatPin('123456')).toBe('123 456');
    expect(percent(1, 3)).toBe(33);
    expect(percent(1, 0)).toBe(0);
  });
});
