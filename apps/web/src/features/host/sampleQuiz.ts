import type { QuizInput } from '@power-quiz/shared';
import { createId } from '../../lib/format';

const mc = (text: string, options: string[], correct: number, timeLimitSec = 20) => {
  const withIds = options.map((option) => ({ id: createId(), text: option }));
  return {
    id: createId(),
    type: 'mc' as const,
    text,
    options: withIds,
    correctOptionId: withIds[correct]?.id ?? withIds[0]!.id,
    timeLimitSec,
  };
};

const open = (text: string, timeLimitSec = 30) => ({
  id: createId(),
  type: 'open' as const,
  text,
  timeLimitSec,
});

export function sampleQuiz(): QuizInput {
  return {
    title: 'Pixel Grand Prix warm-up',
    description: 'A quick mixed-topic race to try Power Quiz with your group.',
    questions: [
      mc('Which planet is known as the Red Planet?', ['Venus', 'Mars', 'Jupiter', 'Mercury'], 1),
      mc('How many players does a football (soccer) team have on the pitch?', ['9', '10', '11', '12'], 2, 15),
      open('What is your favourite snack for a long drive?'),
      mc(
        'What does “CPU” stand for?',
        ['Central Processing Unit', 'Computer Power Unit', 'Core Program Utility'],
        0,
      ),
      mc('Which is the largest ocean on Earth?', ['Atlantic', 'Indian', 'Pacific', 'Arctic'], 2),
      mc('In which year did humans first walk on the Moon?', ['1965', '1969', '1972', '1975'], 1),
      open('Describe this race so far in one word!'),
      mc(
        'What colour do you get when you mix blue and yellow?',
        ['Green', 'Purple', 'Orange', 'Brown'],
        0,
        10,
      ),
    ],
  };
}
