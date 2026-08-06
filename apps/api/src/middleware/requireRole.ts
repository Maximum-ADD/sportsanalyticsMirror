import type { Request, Response, NextFunction } from "express";
import type { Role } from "@prisma/client";

export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user as { role: Role } | undefined;

    if (!user || !allowedRoles.includes(user.role)) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Insufficient permissions" } });
      return;
    }

    next();
  };
}
