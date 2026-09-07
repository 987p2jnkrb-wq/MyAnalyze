import { NextFunction, Request, Response } from "express";

let apiTail: Promise<void> = Promise.resolve();

/**
 * The desktop app intentionally uses one SQLite connection. Some GET endpoints
 * also perform maintenance writes (for example recurring-occurrence refresh or
 * backup), so serializing only POST/PUT/PATCH/DELETE is not sufficient.
 *
 * We therefore serialize every /api request that reaches this middleware.
 * /api/health is registered before it and stays lock-free.
 */
export async function serializeApiMutations(req: Request, res: Response, next: NextFunction) {
  const previous = apiTail.catch(() => undefined);
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  apiTail = previous.then(() => current);

  let released = false;
  let acquired = false;
  const releaseOnce = () => {
    if (released) return;
    released = true;
    res.off("finish", onFinish);
    res.off("close", onClose);
    req.off("aborted", onAbort);
    release();
  };
  const onFinish = () => {
    // Audit also listens on `finish`. Releasing on the next event-loop turn
    // lets its SQLite write get queued before the next API request starts.
    setImmediate(releaseOnce);
  };
  const onClose = () => {
    // A client that disconnects while waiting must not occupy the queue.
    // Once the request owns the lock, however, the handler may still be
    // executing SQL. Releasing here would allow another transaction to start
    // on the same SQLite connection before the first handler is done.
    if (!acquired) releaseOnce();
  };
  const onAbort = () => {
    if (!acquired) releaseOnce();
  };

  res.once("finish", onFinish);
  res.once("close", onClose);
  req.once("aborted", onAbort);

  await previous;
  if (released || req.aborted || res.destroyed || res.writableEnded) {
    releaseOnce();
    return;
  }

  acquired = true;

  // On a normal response `finish` releases the lock. If the socket was already
  // closed, `finish` may never fire even though the handler later calls
  // res.json()/res.send(). Wrapping end keeps the lock until that server-side
  // handler actually reaches response completion.
  const originalEnd = res.end.bind(res) as (...args: unknown[]) => Response;
  res.end = ((...args: unknown[]) => {
    try {
      return originalEnd(...args);
    } finally {
      setImmediate(releaseOnce);
    }
  }) as Response["end"];

  next();
}
