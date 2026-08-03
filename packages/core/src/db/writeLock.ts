/** Serializes writes to the local SQLite database within this process —
 * the TS analog of the MAUI client's LocalDbWriteLock (itself the client-
 * side stand-in for what Postgres's `FOR UPDATE` does server-side in
 * StockDeductionService). Each device's SQLite file has no other writer to
 * lock against except this same app, so a single mutex around each local
 * write op (checkout, shift open/close, sync-pull apply) is enough to
 * prevent two concurrent local operations from racing on the same batch's
 * stock. */
class AsyncMutex {
  private queue: Promise<unknown> = Promise.resolve();

  run<T>(action: () => Promise<T>): Promise<T> {
    const result = this.queue.then(action, action);
    // Swallow rejection here so one failed op doesn't wedge the queue for
    // everyone after it — the real error still propagates to this call's
    // own caller via the returned (unswallowed) `result` promise.
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export const localDbWriteLock = new AsyncMutex();
