import { describe, expect, it } from 'vitest';
import { emitAck, type QuizSocket } from './socket';

/** Mimics socket.io: `timeout()` returns the socket and `emit` relies on `this`. */
class FakeSocket {
  readonly sent: unknown[][] = [];
  private timeoutMs = 0;

  constructor(private readonly reply: (timeoutMs: number) => [Error | null, unknown]) {}

  timeout(ms: number) {
    this.timeoutMs = ms;
    return this;
  }

  emit(...args: unknown[]) {
    const ack = args.pop() as (error: Error | null, response: unknown) => void;
    this.sent.push(args);
    ack(...this.reply(this.timeoutMs));
    return this;
  }
}

const asSocket = (fake: FakeSocket) => fake as unknown as QuizSocket;

describe('emitAck', () => {
  it('emits on the socket and resolves with the acknowledgement', async () => {
    const fake = new FakeSocket((timeoutMs) => [null, { ok: true, timeoutMs }]);
    await expect(emitAck(asSocket(fake), 'host:start')).resolves.toEqual({ ok: true, timeoutMs: 8000 });
    expect(fake.sent).toEqual([['host:start']]);
  });

  it('sends the payload before the acknowledgement callback', async () => {
    const fake = new FakeSocket(() => [null, { ok: true }]);
    await emitAck(asSocket(fake), 'player:answer', { questionIndex: 0, optionId: 'a' }, 500);
    expect(fake.sent).toEqual([['player:answer', { questionIndex: 0, optionId: 'a' }]]);
  });

  it('turns a missing acknowledgement into a friendly error', async () => {
    const fake = new FakeSocket(() => [new Error('operation has timed out'), undefined]);
    await expect(emitAck(asSocket(fake), 'host:next')).resolves.toMatchObject({
      ok: false,
      code: 'INTERNAL',
    });
  });
});
