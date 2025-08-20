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

export const parsePojoString = (input: string): Record<string, any> => {
  const normalize = (str: string) =>
    str
      .replace(/<null>/g, 'null')
      .replace(/(\w+)=\w+\[/g, '$1=['); // Strip class names

  const tokenize = (str: string): string[] => {
    const tokens: string[] = [];
    let buf = '', depth = 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === '[') depth++;
      if (ch === ']') depth--;
      if (ch === ',' && depth === 0) {
        tokens.push(buf.trim());
        buf = '';
      } else {
        buf += ch;
      }
    }
    if (buf) tokens.push(buf.trim());
    return tokens;
  };

  const parseValue = (val: string): any => {
    if (val === 'null') return null;
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (!isNaN(Number(val))) return Number(val);
    if (val.startsWith('[') && val.endsWith(']')) return parseList(val.slice(1, -1));
    return val;
  };

  const parseList = (str: string): any[] => tokenize(str).map(parseItem);

  const parseItem = (item: string): any => {
    if (item.includes('=') && item.includes('[') && item.endsWith(']')) {
      const idx = item.indexOf('[');
      const prefix = item.slice(0, idx);
      const inner = item.slice(idx + 1, -1);
      return { [prefix.split('=')[0]]: parseObject(inner) };
    }
    if (item.includes('=')) {
      const [k, ...rest] = item.split('=');
      return { [k]: parseValue(rest.join('=')) };
    }
    return parseValue(item);
  };

  const parseObject = (str: string): Record<string, any> => {
    const result: Record<string, any> = {};
    for (const tok of tokenize(str)) {
      const parsed = parseItem(tok);
      if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        Object.assign(result, parsed);
      }
    }
    return result;
  };

  const bracketStart = input.indexOf('[');
  const content = normalize(input.slice(bracketStart + 1, -1));
  return parseObject(content);
};


type Diff =
  | { type: 'missing-in-obj1'; path: string; valueInObj2: any }
  | { type: 'missing-in-obj2'; path: string; valueInObj1: any }
  | { type: 'value-mismatch'; path: string; valueInObj1: any; valueInObj2: any };

export const diffObjects = (
  obj1: Record<string, any>,
  obj2: Record<string, any>,
  path = ''
): Diff[] => {
  const diffs: Diff[] = [];
  const keys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);

  for (const key of keys) {
    const fullPath = path ? `${path}.${key}` : key;
    const val1 = obj1[key];
    const val2 = obj2[key];

    if (!(key in obj1)) {
      diffs.push({ type: 'missing-in-obj1', path: fullPath, valueInObj2: val2 });
    } else if (!(key in obj2)) {
      diffs.push({ type: 'missing-in-obj2', path: fullPath, valueInObj1: val1 });
    } else if (
      val1 &&
      val2 &&
      typeof val1 === 'object' &&
      typeof val2 === 'object' &&
      !Array.isArray(val1) &&
      !Array.isArray(val2)
    ) {
      diffs.push(...diffObjects(val1, val2, fullPath));
    } else if (val1 !== val2) {
      diffs.push({ type: 'value-mismatch', path: fullPath, valueInObj1: val1, valueInObj2: val2 });
    }
  }

  return diffs;
};
