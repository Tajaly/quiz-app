export function formatPoints(points: number): string {
  return points.toLocaleString('en-US');
}

export function ordinal(value: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const mod100 = value % 100;
  return `${value}${suffixes[(mod100 - 20) % 10] ?? suffixes[mod100] ?? 'th'}`;
}

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

export function formatPin(pin: string): string {
  return pin.length === 6 ? `${pin.slice(0, 3)} ${pin.slice(3)}` : pin;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

export function percent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/** Works in insecure contexts too (crypto.randomUUID needs HTTPS outside localhost). */
export function createId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
