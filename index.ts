// delaying between retries, simulating latency, or pacing async operations in scripts.
export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// performance tracing in scripts
export const timeTrackerMs = (label = 'task') => {
  const start = process.hrtime.bigint();
  return () => {
    const diff = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`-> ${label} took ${diff.toFixed(2)} ms`);
  };
};

export const timeTrackerMsWithReturn = (label = 'task'): (() => number) => {
  const start = process.hrtime.bigint();
  return () => {
    const diff = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`-> ${label} took ${diff.toFixed(2)} ms`);
    return diff;
  };
};

// resilient I/O, network calls, or anything potentially flaky.
export const retry = async <T>(fn: () => Promise<T>, retries: number = 3, delayMs: number = 500): Promise<T> => {
  let lastErr: unknown;

  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === retries) break;
      await sleep(delayMs);
    }
  }
  throw lastErr;
}

// HO wrappers for methods
export const before = <T extends (...args: any[]) => any>(fn: T, beforeFn: (...args: Parameters<T>) => void): T => {
  return ((...args: Parameters<T>) => {
    fn(...args);
    return beforeFn(...args)
  }) as T
}

export const afterFn = <T extends (...args: any[]) => any>(fn: T, afterFn: (result: ReturnType<T>, ...args: Parameters<T>) => void): T => {
  return ((...args: Parameters<T>) => {
    const result = fn(...args);
    afterFn(result, ...args);
    return result;
  }) as T
}

export const aroundFn = <T extends (...args: any[]) => any>(fn: T, wrapper: (original: T, ...args: Parameters<T>) => ReturnType<T>): T => {
  return ((...args: Parameters<T>) => wrapper(fn, ...args)) as T;
}

export const logMethodDetails = <T extends (...args: any[]) => any>(fn: T, logger: (msg: string) => void = console.log): T => {
  return ((...args: Parameters<T>) => {
    logger(`Calling method: ${fn.name} with args: ${JSON.stringify(args)}`);
    const result = fn(...args);
    logger(`Result: ${JSON.stringify(result)}`);
    return result;
  }) as T;
}

type CacheEntry<T> = {
  value: T;
  cachedAt: number;
  ttlMs?: number; // no expiry
}

export const memoizeCache = <T extends (...args: any[]) => any>(fn: T, ttlMs: number): T => {
  const cacheMap = new Map<string, CacheEntry<T>>;
  return ((...args: Parameters<T>) => {
    const key = JSON.stringify(args);
    const now = Date.now();
    const cached = cacheMap.get(key);

    const isExpired = (entry: CacheEntry<T>) =>
      entry.ttlMs !== undefined && now - entry.cachedAt > entry.ttlMs;

    const hasTtlChanged = (entry: CacheEntry<T>) =>
      entry.ttlMs !== ttlMs;

    if (cached && !isExpired(cached) && !hasTtlChanged(cached)) {
      return cached.value;
    }

    const result = fn(...args);
    cacheMap.set(key, {
      value: result,
      cachedAt: now,
      ttlMs: ttlMs,
    });

    return result;
  }) as T;
}

export const debounce = <T extends (...args: any[]) => any>(fn: T, delayMs: number): T => {
  let timer: NodeJS.Timeout;
  return ((...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  }) as T;
}

export const throttle = <T extends (...args: any[]) => any>(fn: T, limitMs: number): T => {
  let throttle: boolean = false;
  return ((...args: Parameters<T>) => {
    if (!throttle) {
      const result = fn(...args);
      throttle = true;
      setTimeout(() => (throttle = false), limitMs);
    }
    return
  }) as T
}