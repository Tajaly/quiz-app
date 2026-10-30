import { kartSchema, type Kart, type PlayerCredentials } from '@power-quiz/shared';

const PLAYER_PREFIX = 'pq:player:';
const LAST_PLAYER_KEY = 'pq:lastPlayer';
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private mode); the game still works without rejoin support.
  }
}

export function saveCredentials(credentials: PlayerCredentials): void {
  write(PLAYER_PREFIX + credentials.pin, { ...credentials, savedAt: Date.now() });
}

export function loadCredentials(pin: string): PlayerCredentials | null {
  const value = read(PLAYER_PREFIX + pin) as (Partial<PlayerCredentials> & { savedAt?: number }) | null;
  if (
    !value ||
    typeof value.sessionId !== 'string' ||
    typeof value.playerId !== 'string' ||
    typeof value.playerToken !== 'string' ||
    typeof value.savedAt !== 'number' ||
    Date.now() - value.savedAt > MAX_AGE_MS
  ) {
    return null;
  }
  return { sessionId: value.sessionId, pin, playerId: value.playerId, playerToken: value.playerToken };
}

export function clearCredentials(pin: string): void {
  try {
    localStorage.removeItem(PLAYER_PREFIX + pin);
  } catch {
    // ignore
  }
}

export function saveLastPlayer(player: { nickname: string; kart: Kart }): void {
  write(LAST_PLAYER_KEY, player);
}

export function loadLastPlayer(): { nickname: string; kart: Kart } | null {
  const value = read(LAST_PLAYER_KEY) as { nickname?: unknown; kart?: unknown } | null;
  const kart = kartSchema.safeParse(value?.kart);
  if (!value || typeof value.nickname !== 'string' || !kart.success) return null;
  return { nickname: value.nickname, kart: kart.data };
}
