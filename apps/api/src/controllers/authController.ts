import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { passport } from "../lib/passport.js";
import { prisma } from "../lib/prisma.js";
import * as userService from "../services/userService.js";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function signUp(req: Request, res: Response, next: NextFunction) {
  const parseResult = credentialsSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: { code: "INVALID_BODY", message: parseResult.error.message } });
    return;
  }

  try {
    const user = await userService.createUser(parseResult.data.email, parseResult.data.password);
    req.login(user, (err) => {
      if (err) return next(err);
      res.status(201).json({ id: user.id, email: user.email, role: user.role });
    });
  } catch (error) {
    next(error);
  }
}

export function signIn(req: Request, res: Response, next: NextFunction) {
  passport.authenticate("local", (err: unknown, user: Express.User | false, info: { message?: string }) => {
    if (err) return next(err);
    if (!user) {
      res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: info?.message ?? "Sign in failed" } });
      return;
    }

    req.login(user, (loginErr) => {
      if (loginErr) return next(loginErr);
      res.status(200).json(user);
    });
  })(req, res, next);
}

export function signOut(req: Request, res: Response, next: NextFunction) {
  req.logout((err) => {
    if (err) return next(err);
    res.status(204).send();
  });
}

export async function requestPasswordReset(req: Request, res: Response) {
  const email = String(req.body?.email ?? "");
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    // Do not reveal whether the email exists.
    res.status(202).json({ message: "If that account exists, a reset link has been sent" });
    return;
  }

  const token = userService.createPasswordResetToken(user.id);
  res.status(202).json({ message: "If that account exists, a reset link has been sent", token });
}

export async function resetPassword(req: Request, res: Response) {
  const { token, password } = req.body ?? {};
  if (typeof token !== "string" || typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: { code: "INVALID_BODY", message: "token and password (min 8 chars) are required" } });
    return;
  }

  const succeeded = await userService.resetPasswordWithToken(token, password);
  if (!succeeded) {
    res.status(400).json({ error: { code: "INVALID_TOKEN", message: "Reset token is invalid or expired" } });
    return;
  }

  res.status(200).json({ message: "Password updated" });
}

export async function deleteAccount(req: Request, res: Response, next: NextFunction) {
  const user = req.user as { id: string } | undefined;
  if (!user) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Sign in required" } });
    return;
  }

  try {
    await userService.deleteUser(user.id);
    req.logout((err) => {
      if (err) return next(err);
      res.status(200).json({ message: "Account deleted" });
    });
  } catch (error) {
    next(error);
  }
}
