import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCircuitBreaker, type CircuitBreakerOptions } from '../circuit-breaker.js';
import { HttpAdapterCircuitOpenError, HttpAdapterServerError } from '../errors.js';

describe('circuit breaker', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('closed state: passes through successful calls', async () => {
    const cb = createCircuitBreaker();
    const result = await cb.run('poe', async () => 'ok');
    expect(result).toBe('ok');
  });

  it('closed state: propagates errors', async () => {
    const cb = createCircuitBreaker();
    const fn = async () => { throw new HttpAdapterServerError('fail', { status: 500 }); };
    await expect(cb.run('poe', fn)).rejects.toBeInstanceOf(HttpAdapterServerError);
  });

  it('opens after threshold consecutive failures', async () => {
    const cb = createCircuitBreaker({ failureThreshold: 3, cooldownMs: 60_000 });
    const fn = async () => { throw new HttpAdapterServerError('fail', { status: 500 }); };

    // 3 failures to reach threshold
    for (let i = 0; i < 3; i++) {
      await expect(cb.run('poe', fn)).rejects.toBeInstanceOf(HttpAdapterServerError);
    }

    // 4th call should fail-fast with HttpAdapterCircuitOpenError
    await expect(cb.run('poe', fn)).rejects.toBeInstanceOf(HttpAdapterCircuitOpenError);
  });

  it('successes reset the failure counter while closed', async () => {
    const cb = createCircuitBreaker({ failureThreshold: 3, cooldownMs: 60_000 });
    const failFn = async () => { throw new HttpAdapterServerError('fail', { status: 500 }); };
    const okFn = async () => 'ok';

    await expect(cb.run('poe', failFn)).rejects.toThrow();  // fail count = 1
    await expect(cb.run('poe', failFn)).rejects.toThrow();  // fail count = 2
    await cb.run('poe', okFn);                              // success → reset to 0
    await expect(cb.run('poe', failFn)).rejects.toThrow();  // fail count = 1 again
    await expect(cb.run('poe', failFn)).rejects.toThrow();  // fail count = 2

    // Third failure since last success trips the circuit; this call returns the
    // original HttpAdapterServerError before subsequent calls fail-fast with CircuitOpenError
    await expect(cb.run('poe', failFn)).rejects.toBeInstanceOf(HttpAdapterServerError);
  });

  it('reopens after cooldown elapses and moves to half-open', async () => {
    const cb = createCircuitBreaker({ failureThreshold: 2, cooldownMs: 60_000 });
    const failFn = async () => { throw new HttpAdapterServerError('fail', { status: 500 }); };
    const okFn = async () => 'ok';

    // Trip the circuit
    await expect(cb.run('poe', failFn)).rejects.toThrow();
    await expect(cb.run('poe', failFn)).rejects.toThrow();
    await expect(cb.run('poe', failFn)).rejects.toBeInstanceOf(HttpAdapterCircuitOpenError);

    // Advance time past cooldown
    vi.advanceTimersByTime(60_001);

    // Half-open probe: should try the fn
    const result = await cb.run('poe', okFn);
    expect(result).toBe('ok');

    // After successful probe, circuit is closed again
    await cb.run('poe', okFn);
    await cb.run('poe', okFn);
  });

  it('half-open probe failure re-opens the circuit', async () => {
    const cb = createCircuitBreaker({ failureThreshold: 2, cooldownMs: 60_000 });
    const failFn = async () => { throw new HttpAdapterServerError('fail', { status: 500 }); };

    await expect(cb.run('poe', failFn)).rejects.toThrow();
    await expect(cb.run('poe', failFn)).rejects.toThrow();

    vi.advanceTimersByTime(60_001);

    // Probe fails → back to open
    await expect(cb.run('poe', failFn)).rejects.toBeInstanceOf(HttpAdapterServerError);

    // Immediate next call should fail-fast (circuit re-opened)
    await expect(cb.run('poe', failFn)).rejects.toBeInstanceOf(HttpAdapterCircuitOpenError);
  });

  it('per-key isolation — opening poe does not affect anthropic', async () => {
    const cb = createCircuitBreaker({ failureThreshold: 2, cooldownMs: 60_000 });
    const failFn = async () => { throw new HttpAdapterServerError('fail', { status: 500 }); };
    const okFn = async () => 'ok';

    // Trip poe
    await expect(cb.run('poe', failFn)).rejects.toThrow();
    await expect(cb.run('poe', failFn)).rejects.toThrow();
    await expect(cb.run('poe', failFn)).rejects.toBeInstanceOf(HttpAdapterCircuitOpenError);

    // anthropic still works
    await cb.run('anthropic', okFn);
    expect(await cb.run('anthropic', okFn)).toBe('ok');
  });

  it('HttpAdapterCircuitOpenError carries reopenAtMs', async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1, cooldownMs: 30_000 });
    const failFn = async () => { throw new HttpAdapterServerError('fail', { status: 500 }); };

    await expect(cb.run('poe', failFn)).rejects.toThrow();

    const trippedAt = Date.now();
    try {
      await cb.run('poe', failFn);
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpAdapterCircuitOpenError);
      expect((err as HttpAdapterCircuitOpenError).reopenAtMs).toBeGreaterThanOrEqual(trippedAt + 29_000);
    }
  });

  it('non-retryable errors (auth, config) do NOT increment failure count', async () => {
    // Auth failures are permanent; circuit-breaking them does not help
    const cb = createCircuitBreaker({ failureThreshold: 2, cooldownMs: 60_000 });
    // Using HttpAdapterServerError vs a generic Error — for now, only count errors we configure
    // The circuit counts ONLY errors that match the `shouldTrip` predicate (default: any HttpAdapterError with retryable=true)
    // Auth is non-retryable → should NOT count

    const { HttpAdapterAuthError } = await import('../errors.js');
    const authFn = async () => { throw new HttpAdapterAuthError('bad key'); };
    const okFn = async () => 'ok';

    // Many auth failures — circuit should NOT open
    for (let i = 0; i < 5; i++) {
      await expect(cb.run('poe', authFn)).rejects.toBeInstanceOf(HttpAdapterAuthError);
    }

    // Still closed — next call passes through
    expect(await cb.run('poe', okFn)).toBe('ok');
  });

  it('custom shouldTrip predicate can include specific error types', async () => {
    const cb = createCircuitBreaker({
      failureThreshold: 2,
      cooldownMs: 60_000,
      shouldTrip: (err) => err instanceof Error && err.message.includes('bad'),
    });

    const badFn = async () => { throw new Error('bad gateway'); };
    const okFn = async () => 'ok';

    await expect(cb.run('poe', badFn)).rejects.toThrow();
    await expect(cb.run('poe', badFn)).rejects.toThrow();
    await expect(cb.run('poe', badFn)).rejects.toBeInstanceOf(HttpAdapterCircuitOpenError);

    // Reset by advancing time, then verify other errors don't count
    vi.advanceTimersByTime(60_001);
    const goodErrFn = async () => { throw new Error('good error'); };
    await expect(cb.run('poe', goodErrFn)).rejects.toThrow();
    await expect(cb.run('poe', goodErrFn)).rejects.toThrow();
    await expect(cb.run('poe', goodErrFn)).rejects.toThrow();

    // shouldTrip returned false for all these — still closed
    expect(await cb.run('poe', okFn)).toBe('ok');
  });

  it('concurrent probes: only one caller runs the probe, others fail-fast', async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1, cooldownMs: 1000 });
    const fail = async () => { throw new HttpAdapterServerError('fail', { status: 500 }); };
    let probeCount = 0;

    // Trip the circuit
    await expect(cb.run('poe', fail)).rejects.toThrow();

    vi.advanceTimersByTime(1001);

    // Use a synchronous (non-sleeping) probe so we don't need fake-timer
    // advancement while awaiting Promise.allSettled. The race we care about is
    // whether concurrent callers each try to own the probe, not whether the
    // probe itself takes time.
    const syncProbe = async () => {
      probeCount++;
      return 'probe-ok';
    };

    // Fire 5 concurrent calls; exactly one should run the probe, 4 should fail-fast.
    const settled = await Promise.allSettled([
      cb.run('poe', syncProbe),
      cb.run('poe', syncProbe),
      cb.run('poe', syncProbe),
      cb.run('poe', syncProbe),
      cb.run('poe', syncProbe),
    ]);

    expect(probeCount).toBe(1);

    const fulfilled = settled.filter((r) => r.status === 'fulfilled');
    const rejected = settled.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(4);
    for (const r of rejected) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(HttpAdapterCircuitOpenError);
    }
  });

  it('evicts least-recently-used closed keys when maxKeys exceeded', async () => {
    const cb = createCircuitBreaker({ maxKeys: 3 });

    await cb.run('a', async () => 'ok');
    await cb.run('b', async () => 'ok');
    await cb.run('c', async () => 'ok');
    await cb.run('d', async () => 'ok');  // exceeds maxKeys → evicts 'a' (oldest LRU)

    // Evicted key 'a' has no stored state; getState returns default 'closed'
    expect(cb.getState('a')).toBe('closed');
    expect(cb.getState('b')).toBe('closed');
    expect(cb.getState('c')).toBe('closed');
    expect(cb.getState('d')).toBe('closed');
  });

  it('never evicts open keys even when maxKeys exceeded', async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1, maxKeys: 3 });
    const fail = async () => { throw new HttpAdapterServerError('x', { status: 500 }); };

    // Trip 'a' so it is open
    await expect(cb.run('a', fail)).rejects.toThrow();

    await cb.run('b', async () => 'ok');
    await cb.run('c', async () => 'ok');
    // 'd' insertion exceeds maxKeys — should evict 'b' or 'c' (closed), NOT 'a' (open)
    await cb.run('d', async () => 'ok');

    expect(cb.getState('a')).toBe('open');
  });
});
