import { describe, expect, it } from 'vitest';
import { clientIp, FailureLimiter } from './net';

describe('clientIp', () => {
  it('uses the socket address when no proxy is trusted', () => {
    expect(clientIp('6.6.6.6', '::ffff:10.0.0.1', 0)).toBe('10.0.0.1');
  });

  it('trusts only the configured number of proxy hops', () => {
    expect(clientIp('6.6.6.6, 203.0.113.7:51234', '10.0.0.1', 1)).toBe('203.0.113.7');
    expect(clientIp(['[2001:db8::1]:443'], '10.0.0.1', 1)).toBe('2001:db8::1');
  });
});

describe('FailureLimiter', () => {
  it('blocks after the limit within the window and resets afterwards', () => {
    const limiter = new FailureLimiter(2, 1000);
    limiter.recordFailure('ip', 0);
    expect(limiter.isLimited('ip', 10)).toBe(false);
    limiter.recordFailure('ip', 20);
    expect(limiter.isLimited('ip', 30)).toBe(true);
    expect(limiter.isLimited('other', 30)).toBe(false);
    expect(limiter.isLimited('ip', 1001)).toBe(false);
  });
});
