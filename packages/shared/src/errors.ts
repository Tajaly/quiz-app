export const ERROR_CODES = [
  'INVALID',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'NOT_ATTACHED',
  'RATE_LIMITED',
  'LOCKED',
  'FULL',
  'NAME_TAKEN',
  'NAME_REJECTED',
  'WRONG_PHASE',
  'ALREADY_ANSWERED',
  'TOO_LATE',
  'KICKED',
  'ENDED',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
