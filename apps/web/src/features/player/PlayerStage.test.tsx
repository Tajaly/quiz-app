import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
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
  result: null,
  final: null,
};

function renderStage(view: PlayerView, onAnswer = vi.fn().mockResolvedValue({ ok: true })) {
  render(
    <MemoryRouter>
      <PlayerStage timed={{ view, receivedAt: performance.now() }} onAnswer={onAnswer} />
    </MemoryRouter>,
  );
  return onAnswer;
}

describe('PlayerStage', () => {
  it('sends the chosen option and locks the answer in', async () => {
    const onAnswer = renderStage(questionView);
    await userEvent.click(screen.getByRole('button', { name: 'Paris' }));
    expect(onAnswer).toHaveBeenCalledWith({ questionIndex: 0, optionId: 'a' });
    expect(await screen.findByText(/Locked in/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rome' })).toBeDisabled();
  });

  it('lets the player retry when the server rejects the answer', async () => {
    const onAnswer = vi
      .fn()
      .mockResolvedValue({ ok: false, code: 'INVALID', error: 'Pick one of the answers.' });
    renderStage(questionView, onAnswer);
    await userEvent.click(screen.getByRole('button', { name: 'Paris' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Pick one of the answers.');
    expect(screen.getByRole('button', { name: 'Rome' })).toBeEnabled();
  });

  it('submits open answers', async () => {
    const onAnswer = renderStage({
      ...questionView,
      question: { ...questionView.question!, type: 'open', options: null, text: 'Favourite colour?' },
    });
    await userEvent.type(screen.getByLabelText(/Your answer/), '  racing   red ');
    await userEvent.click(screen.getByRole('button', { name: /Send answer/ }));
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
