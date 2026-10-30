export const LIMITS = {
  quizTitleMax: 80,
  quizDescriptionMax: 300,
  questionsPerQuizMax: 50,
  questionTextMax: 200,
  optionTextMax: 80,
  optionsMin: 2,
  optionsMax: 4,
  openAnswerMax: 80,
  nicknameMax: 20,
  timeLimitMinSec: 5,
  timeLimitMaxSec: 120,
  playersPerSessionMax: 250,
} as const;

export const DEFAULT_TIME_LIMIT_SEC = 20;
export const TIME_LIMIT_CHOICES_SEC = [5, 10, 15, 20, 30, 45, 60, 90, 120] as const;

/** Duration of the traffic-light countdown shown before every question. */
export const COUNTDOWN_MS = 3000;
/** Extra time after the visible deadline in which answers are still accepted (network latency). */
export const ANSWER_GRACE_MS = 300;
export const MAX_POINTS = 1000;
export const SCOREBOARD_SIZE = 5;
export const PODIUM_SIZE = 3;
export const PIN_LENGTH = 6;
