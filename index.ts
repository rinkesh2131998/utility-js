export const sleep = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms))
}

export const timeTracker = (label = 'task') => {
  const start = process.hrtime.bigint();
  return () => {
    const diff = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`-> ${label} took ${diff.toFixed(2)} ms`);
  };
};

export const timeTrackerWithReturn = (label = 'task'): (() => number) => {
  const start = process.hrtime.bigint();
  return () => {
    const diff = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`-> ${label} took ${diff.toFixed(2)} ms`);
    return diff;
  };
};

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