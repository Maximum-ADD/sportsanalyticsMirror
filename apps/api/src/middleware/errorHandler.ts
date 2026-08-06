import type { Request, Response, NextFunction } from "express";

export function handleNotFound(req: Request, res: Response): void {
  res.status(404).json({ error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}` } });
}

// Express recognises error-handling middleware by arity, so all four params must stay.
export function handleError(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  console.error(err);
  const message = err instanceof Error ? err.message : "Unexpected server error";
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message } });
}
