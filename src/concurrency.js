const pendingLocks = new Map();

export function withExclusiveLock(name, task, { wait = true } = {}) {
  const unavailable = () => {
    const error = new Error("다른 BOOTH Shelf 창에서 작업이 진행 중입니다.");
    error.code = "STATE_BUSY";
    throw error;
  };
  if (globalThis.navigator?.locks?.request) {
    return navigator.locks.request(
      name,
      { mode: "exclusive", ...(wait ? {} : { ifAvailable: true }) },
      (lock) => lock ? task() : unavailable(),
    );
  }

  const previous = pendingLocks.get(name);
  if (previous && !wait) return Promise.resolve().then(unavailable);
  const next = (previous ?? Promise.resolve()).catch(() => {}).then(task);
  pendingLocks.set(name, next);
  return next.finally(() => {
    if (pendingLocks.get(name) === next) pendingLocks.delete(name);
  });
}
