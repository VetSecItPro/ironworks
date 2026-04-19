import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRateLimiter, type RateLimiterOptions } from '../rate-limiter.js';

describe('rate limiter', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('immediate grant when capacity available', async () => {
    const rl = createRateLimiter({ tokensPerSecond: 10, maxCapacity: 10 });
    await rl.acquire('poe');  // 1 token, bucket starts full
    // no wait
  });

  it('waits for refill when capacity exhausted', async () => {
    const rl = createRateLimiter({ tokensPerSecond: 10, maxCapacity: 2 });
    // Drain the bucket
    await rl.acquire('poe');
    await rl.acquire('poe');

    // Third acquire must wait ~100ms for refill (1 token / (10 tok/s) = 100ms)
    const start = Date.now();
    const p = rl.acquire('poe');
    await vi.advanceTimersByTimeAsync(101);
    await p;
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(100);
  });

  it('FIFO queue for concurrent waiters', async () => {
    const rl = createRateLimiter({ tokensPerSecond: 10, maxCapacity: 1 });
    await rl.acquire('poe');  // drain bucket

    const order: number[] = [];
    const p1 = rl.acquire('poe').then(() => order.push(1));
    const p2 = rl.acquire('poe').then(() => order.push(2));
    const p3 = rl.acquire('poe').then(() => order.push(3));

    await vi.advanceTimersByTimeAsync(350);  // enough for 3+ refills
    await Promise.all([p1, p2, p3]);

    expect(order).toEqual([1, 2, 3]);
  });

  it('per-key isolation: draining poe does not delay anthropic', async () => {
    const rl = createRateLimiter({ tokensPerSecond: 10, maxCapacity: 2 });
    await rl.acquire('poe');
    await rl.acquire('poe');

    const p = rl.acquire('anthropic');
    await p;  // no wait
  });

  it('capacity caps refill: bucket cannot exceed maxCapacity', async () => {
    const rl = createRateLimiter({ tokensPerSecond: 10, maxCapacity: 3 });
    // Wait a long time without acquiring; bucket refills to max but stops there
    vi.advanceTimersByTime(60_000);

    // Now 3 instant acquires should succeed
    await rl.acquire('poe');
    await rl.acquire('poe');
    await rl.acquire('poe');

    // 4th must wait for a refill
    const p = rl.acquire('poe');
    let resolved = false;
    p.then(() => { resolved = true; });
    await vi.advanceTimersByTimeAsync(50);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(60);
    await p;
    expect(resolved).toBe(true);
  });

  it('acquires N tokens at once (burst cost)', async () => {
    const rl = createRateLimiter({ tokensPerSecond: 10, maxCapacity: 10 });
    await rl.acquire('poe', 5);  // cost = 5
    await rl.acquire('poe', 5);  // cost = 5, bucket empty

    // Next must wait for 500ms of refill for another 5 tokens
    const start = Date.now();
    const p = rl.acquire('poe', 5);
    await vi.advanceTimersByTimeAsync(501);
    await p;
    expect(Date.now() - start).toBeGreaterThanOrEqual(500);
  });

  it('rejects requests for more than maxCapacity as invalid', async () => {
    const rl = createRateLimiter({ tokensPerSecond: 10, maxCapacity: 5 });
    await expect(rl.acquire('poe', 10)).rejects.toThrow(/exceeds capacity/i);
  });

  it('abortSignal cancels a waiting acquire', async () => {
    const rl = createRateLimiter({ tokensPerSecond: 10, maxCapacity: 1 });
    await rl.acquire('poe');  // drain

    const ac = new AbortController();
    const p = rl.acquire('poe', 1, ac.signal);
    // Suppress the unhandled-rejection warning: the abort fires inside
    // advanceTimersByTimeAsync before expect(p).rejects can attach its handler.
    p.catch(() => undefined);

    setTimeout(() => ac.abort(), 10);
    await vi.advanceTimersByTimeAsync(20);

    await expect(p).rejects.toThrow();
  });

  it('abortSignal already aborted: rejects immediately without consuming tokens', async () => {
    const rl = createRateLimiter({ tokensPerSecond: 10, maxCapacity: 5 });
    const ac = new AbortController();
    ac.abort();

    await expect(rl.acquire('poe', 1, ac.signal)).rejects.toThrow();

    // Should NOT have consumed a token — next acquire is immediate
    await rl.acquire('poe');  // still instant
  });

  it('bounded memory: maxKeys caps the number of key states', async () => {
    const rl = createRateLimiter({ tokensPerSecond: 10, maxCapacity: 5, maxKeys: 3 });
    await rl.acquire('a');
    await rl.acquire('b');
    await rl.acquire('c');
    await rl.acquire('d');  // exceeds maxKeys → evicts 'a' (LRU)

    // 'a' is a fresh key again
    await rl.acquire('a');  // instant (fresh bucket at max)
  });

  it('queue prevents starvation: a single-token request does not block a 5-token request indefinitely', async () => {
    // This tests FIFO: if a 5-token request is queued first, a subsequent 1-token
    // request waits behind it even though 1 token is sooner-available
    const rl = createRateLimiter({ tokensPerSecond: 10, maxCapacity: 5 });
    await rl.acquire('poe', 5);  // drain

    const order: string[] = [];
    const p1 = rl.acquire('poe', 5).then(() => order.push('big'));
    const p2 = rl.acquire('poe', 1).then(() => order.push('small'));

    await vi.advanceTimersByTimeAsync(600);  // enough for 5+1 tokens to refill
    await Promise.all([p1, p2]);

    // big came first, big was served first (no starvation of later single-token request)
    expect(order).toEqual(['big', 'small']);
  });

  it('reset() rejects queued waiters rather than orphaning them', async () => {
    const rl = createRateLimiter({ tokensPerSecond: 1, maxCapacity: 1 });
    await rl.acquire('poe');  // drain

    const p1 = rl.acquire('poe');
    const p2 = rl.acquire('poe');

    // Both are now queued waiting for refill
    rl.reset('poe');

    await expect(p1).rejects.toThrow(/reset/i);
    await expect(p2).rejects.toThrow(/reset/i);
  });

  it('abort listeners are removed on normal resolve (no leak under long-lived signals)', async () => {
    const rl = createRateLimiter({ tokensPerSecond: 10, maxCapacity: 1 });

    // Build a tracked AbortController so we can count add vs remove calls
    const ac = new AbortController();
    let adds = 0;
    let removes = 0;
    const origAdd = ac.signal.addEventListener.bind(ac.signal);
    const origRemove = ac.signal.removeEventListener.bind(ac.signal);
    (ac.signal as EventTarget).addEventListener = (...args: Parameters<typeof origAdd>) => {
      adds++;
      return origAdd(...args);
    };
    (ac.signal as EventTarget).removeEventListener = (...args: Parameters<typeof origRemove>) => {
      removes++;
      return origRemove(...args);
    };
    const getDelta = () => adds - removes;

    await rl.acquire('poe');  // drain

    // Queue 5 waiters sharing the same signal; let them all resolve naturally
    const waiters = Array.from({ length: 5 }, () => rl.acquire('poe', 1, ac.signal));

    await vi.advanceTimersByTimeAsync(600);  // refill enough for all 5
    await Promise.all(waiters);

    // Each acquire added a listener; each resolve should have removed it.
    expect(getDelta()).toBe(0);
  });

  it('rejects tokensPerSecond <= 0 at construction', () => {
    expect(() => createRateLimiter({ tokensPerSecond: 0 })).toThrow();
    expect(() => createRateLimiter({ tokensPerSecond: -1 })).toThrow();
  });
});
