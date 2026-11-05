import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { PlayerView } from '@power-quiz/shared';
import { PlayerStage } from './PlayerStage';

const questionView: PlayerView = {
  sessionId: 's1',
  pin: '123456',
  quizTitle: 'Grand Prix',
  phase: 'question',
  questionIndex: 0,
  questionCount: 3,
  playerCount: 4,
  me: { id: 'p1', nickname: 'Ann', kart: { model: 'rocket', color: 'cyan' }, score: 0, rank: 1 },
  question: {
    index: 0,
    id: 'q1',
    type: 'mc',
    text: 'Capital of France?',
    options: [
      { id: 'a', text: 'Paris' },
      { id: 'b', text: 'Rome' },
    ],
    timeLimitSec: 20,
  },
  countdown: null,
  timer: { remainingMs: 15_000, totalMs: 20_000 },
  myAnswer: null,
  selectedOptionId: null,
  result: null,
  final: null,
};

function renderStage(
  view: PlayerView,
  {
    onSelect = vi.fn().mockResolvedValue({ ok: true }),
    onAnswer = vi.fn().mockResolvedValue({ ok: true }),
  }: { onSelect?: Mock; onAnswer?: Mock } = {},
) {
  const ui = (current: PlayerView) => (
    <MemoryRouter>
      <PlayerStage
        timed={{ view: current, receivedAt: performance.now() }}
        onSelect={onSelect}
        onAnswer={onAnswer}
      />
    </MemoryRouter>
  );
  const { rerender } = render(ui(view));
  /** Simulates the next view pushed by the server. */
  const update = (next: PlayerView) => rerender(ui(next));
  return { onSelect, onAnswer, update };
}

const option = (name: string) => screen.getByRole('button', { name });
const submitButton = () => screen.getByRole('button', { name: /Submit answer/ });

describe('PlayerStage', () => {
  it('lets the player switch answers until they submit', async () => {
    const { onSelect, onAnswer, update } = renderStage(questionView);
    expect(submitButton()).toBeDisabled();

    await userEvent.click(option('Paris'));
    expect(onSelect).toHaveBeenLastCalledWith({ questionIndex: 0, optionId: 'a' });
    await userEvent.click(option('Rome'));
    expect(onSelect).toHaveBeenLastCalledWith({ questionIndex: 0, optionId: 'b' });
    expect(option('Rome')).toHaveAttribute('aria-pressed', 'true');
    expect(option('Paris')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Saving your pick…')).toBeInTheDocument();
    update({ ...questionView, selectedOptionId: 'b' });
    expect(screen.getByText(/You can switch until you submit/)).toBeInTheDocument();
    expect(onAnswer).not.toHaveBeenCalled();

    await userEvent.click(submitButton());
    expect(onAnswer).toHaveBeenCalledWith({ questionIndex: 0, optionId: 'b' });
    expect(await screen.findByText(/Locked in/)).toBeInTheDocument();
    expect(option('Paris')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Submit answer/ })).not.toBeInTheDocument();
  });

  it('restores a pick that has not been submitted yet', async () => {
    const { onAnswer } = renderStage({ ...questionView, selectedOptionId: 'b' });
    expect(option('Rome')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/You can switch until you submit/)).toBeInTheDocument();
    await userEvent.click(submitButton());
    expect(onAnswer).toHaveBeenCalledWith({ questionIndex: 0, optionId: 'b' });
  });

  it('falls back to the confirmed pick when switching fails', async () => {
    const onSelect = vi
      .fn()
      .mockResolvedValue({ ok: false, code: 'TOO_LATE', error: 'Too late – this question is closed.' });
    renderStage({ ...questionView, selectedOptionId: 'a' }, { onSelect });
    await userEvent.click(option('Rome'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too late');
    expect(option('Paris')).toHaveAttribute('aria-pressed', 'true');
    expect(option('Rome')).toHaveAttribute('aria-pressed', 'false');
  });

  it('lets the player retry when the server rejects the answer', async () => {
    const onAnswer = vi
      .fn()
      .mockResolvedValue({ ok: false, code: 'INVALID', error: 'Pick one of the answers.' });
    renderStage(questionView, { onAnswer });
    await userEvent.click(option('Paris'));
    await userEvent.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Pick one of the answers.');
    expect(option('Rome')).toBeEnabled();
    expect(submitButton()).toBeEnabled();
  });

  it('keeps an unsubmitted pick when time runs out', () => {
    renderStage({ ...questionView, timer: { remainingMs: 0, totalMs: 20_000 }, selectedOptionId: 'a' });
    expect(screen.getByText('Time’s up! Your pick counts.')).toBeInTheDocument();
    expect(option('Paris')).toHaveAttribute('aria-pressed', 'true');
    expect(option('Rome')).toBeDisabled();
    expect(submitButton()).toBeDisabled();
  });

  it('submits open answers', async () => {
    const { onAnswer } = renderStage({
      ...questionView,
      question: { ...questionView.question!, type: 'open', options: null, text: 'Favourite colour?' },
    });
    await userEvent.type(screen.getByLabelText(/Your answer/), '  racing   red ');
    await userEvent.click(submitButton());
    expect(onAnswer).toHaveBeenCalledWith({ questionIndex: 0, text: 'racing red' });
  });

  it('shows the correct answer and standing after a wrong answer', () => {
    renderStage({
      ...questionView,
      phase: 'reveal',
      timer: null,
      myAnswer: { optionId: 'b', text: null },
      result: {
        questionIndex: 0,
        type: 'mc',
        answered: true,
        correct: false,
        points: 0,
        myAnswer: { optionId: 'b', text: null },
        correctOption: { id: 'a', text: 'Paris' },
        totalScore: 1200,
        rank: 2,
        gapToNext: 300,
        nextNickname: 'Ben',
      },
    });
    expect(screen.getByText('Not this time')).toBeInTheDocument();
    expect(screen.getByText('Paris')).toBeInTheDocument();
    expect(screen.getByText('2nd')).toBeInTheDocument();
    expect(screen.getByText('300 points behind Ben')).toBeInTheDocument();
  });

  it('celebrates the final position', () => {
    renderStage({
      ...questionView,
      phase: 'final',
      question: null,
      timer: null,
      final: {
        rank: 1,
        score: 2900,
        correctCount: 3,
        totalPlayers: 4,
        podium: [
          {
            playerId: 'p1',
            nickname: 'Ann',
            kart: { model: 'rocket', color: 'cyan' },
            score: 2900,
            correctCount: 3,
            rank: 1,
          },
        ],
      },
    });
    expect(screen.getByText('1st')).toBeInTheDocument();
    expect(screen.getByText('of 4 racers')).toBeInTheDocument();
  });
});
