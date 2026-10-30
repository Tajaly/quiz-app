/**
 * Resolves the client IP. Only the right-most `trustProxy` hops of X-Forwarded-For are trusted,
 * because anything to the left of them can be forged by the client.
 */
export function clientIp(
  forwardedFor: string | string[] | undefined,
  remoteAddress: string | undefined,
  trustProxy: number,
): string {
  if (trustProxy > 0 && forwardedFor) {
    const hops = (Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor)
      .split(',')
      .map((hop) => hop.trim())
      .filter(Boolean);
    const candidate = hops[hops.length - trustProxy] ?? hops[0];
    if (candidate) return stripPort(candidate);
  }
  return stripPort(remoteAddress ?? 'unknown');
}

function stripPort(address: string): string {
  const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(address);
  if (ipv4WithPort?.[1]) return ipv4WithPort[1];
  const bracketedIpv6 = /^\[([^\]]+)\](?::\d+)?$/.exec(address);
  if (bracketedIpv6?.[1]) return bracketedIpv6[1];
  return address.replace(/^::ffff:/, '');
}

/** Counts failures per key in fixed windows, e.g. wrong PIN guesses per IP. */
export class FailureLimiter {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  isLimited(key: string, now = Date.now()): boolean {
    const entry = this.entries.get(key);
    return !!entry && entry.resetAt > now && entry.count >= this.limit;
  }

  recordFailure(key: string, now = Date.now()): void {
    const entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) {
      this.entries.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.entries.size > 10_000) this.prune(now);
      return;
    }
    entry.count += 1;
  }

  private prune(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key);
    }
  }
}
