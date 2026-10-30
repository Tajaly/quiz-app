import { guestHostTokenSchema } from '@power-quiz/shared';

export const GUEST_HOST_STORAGE_KEY = 'pq:guestHost';

export function readGuestHostToken(): string | null {
  let token: string | null;
  try {
    token = localStorage.getItem(GUEST_HOST_STORAGE_KEY);
  } catch (cause) {
    throw new Error('Guest hosting needs browser storage. Allow site storage and try again.', { cause });
  }
  if (token !== null && !guestHostTokenSchema.safeParse(token).success) {
    throw new Error(
      "The saved host key is invalid. Use the browser that created your quizzes. Clearing this site's data starts a new host and removes access to earlier quizzes.",
    );
  }
  return token;
}

export async function getOrCreateGuestHostToken(): Promise<string> {
  const prepare = () => {
    const existing = readGuestHostToken();
    if (existing !== null) return existing;

    let bytes: Uint8Array;
    try {
      bytes = crypto.getRandomValues(new Uint8Array(32));
    } catch (cause) {
      throw new Error('This browser cannot create a secure host key. Update your browser and try again.', {
        cause,
      });
    }
    const token = `guest:${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
    try {
      localStorage.setItem(GUEST_HOST_STORAGE_KEY, token);
    } catch (cause) {
      throw new Error('Your host key could not be saved. Allow site storage and try again.', { cause });
    }
    return token;
  };

  // Serialize first use across tabs where Web Locks is available (HTTPS and localhost).
  return navigator.locks ? navigator.locks.request(GUEST_HOST_STORAGE_KEY, prepare) : prepare();
}
