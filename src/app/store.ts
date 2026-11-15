// One small store: a plain object, shallow patches, listeners told what changed.

export interface Store<S> {
  get(): S;
  /** Merge a patch. Listeners hear about it only if a value really changed. */
  set(patch: Partial<S>): void;
  /** Run `fn` now and again whenever one of `keys` changes. Returns a function that stops it. */
  on(keys: readonly (keyof S)[], fn: (state: S, before: S) => void): () => void;
}

export function createStore<S extends object>(initial: S): Store<S> {
  let state = initial;
  const listeners = new Set<{ keys: readonly (keyof S)[]; fn: (state: S, before: S) => void }>();
  // A listener may set() again; those patches wait their turn so every listener sees every state.
  const waiting: Partial<S>[] = [];
  let telling = false;

  function apply(patch: Partial<S>): void {
    const changed: (keyof S)[] = [];
    for (const key in patch) if (!Object.is(state[key], patch[key])) changed.push(key);
    if (!changed.length) return;
    const before = state;
    state = { ...state, ...patch };
    for (const l of [...listeners]) if (l.keys.some((k) => changed.includes(k))) l.fn(state, before);
  }

  return {
    get: () => state,
    set(patch) {
      waiting.push(patch);
      if (telling) return;
      telling = true;
      try {
        while (waiting.length) apply(waiting.shift()!);
      } finally {
        telling = false;
        waiting.length = 0;
      }
    },
    on(keys, fn) {
      const listener = { keys, fn };
      listeners.add(listener);
      fn(state, state);
      return () => listeners.delete(listener);
    },
  };
}
