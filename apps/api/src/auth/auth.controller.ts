import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { ApiException } from "../common/api-exception.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { AuthService } from "./auth.service.js";
import { LocalAuthGuard } from "./local-auth.guard.js";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// Wraps Passport's callback-style req.login/req.logout in a promise so
// controller handlers can simply await session establishment/teardown.
function establishSession(req: Request, user: Express.User): Promise<void> {
  return new Promise((resolve, reject) => {
    req.login(user, (err) => (err ? reject(err) : resolve()));
  });
}

function endSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.logout((err) => (err ? reject(err) : resolve()));
  });
}

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("signup")
  @HttpCode(HttpStatus.CREATED)
  async signUp(@Body() body: unknown, @Req() req: Request) {
    const parseResult = credentialsSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_BODY", parseResult.error.message);
    }

    const user = await this.authService.createUser(parseResult.data.email, parseResult.data.password);
    await establishSession(req, user);
    return { id: user.id, email: user.email, role: user.role };
  }

  @Post("signin")
  @UseGuards(LocalAuthGuard)
  @HttpCode(HttpStatus.OK)
  async signIn(@Req() req: Request) {
    const user = req.user as Express.User;
    await establishSession(req, user);
    return user;
  }

  @Post("signout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async signOut(@Req() req: Request) {
    await endSession(req);
  }

  @Post("password-reset/request")
  @HttpCode(HttpStatus.ACCEPTED)
  async requestPasswordReset(@Body() body: { email?: unknown }) {
    const email = String(body?.email ?? "");
    const user = await this.authService.findUserByEmail(email);

    if (!user) {
      // Do not reveal whether the email exists.
      return { message: "If that account exists, a reset link has been sent" };
    }

    const token = this.authService.createPasswordResetToken(user.id);
    return { message: "If that account exists, a reset link has been sent", token };
  }

  @Post("password-reset/confirm")
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() body: { token?: unknown; password?: unknown }) {
    const { token, password } = body ?? {};
    if (typeof token !== "string" || typeof password !== "string" || password.length < 8) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_BODY", "token and password (min 8 chars) are required");
    }

    const succeeded = await this.authService.resetPasswordWithToken(token, password);
    if (!succeeded) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_TOKEN", "Reset token is invalid or expired");
    }

    return { message: "Password updated" };
  }

  @Delete("account")
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  async deleteAccount(@Req() req: Request) {
    const user = req.user as { id: string };
    await this.authService.deleteUser(user.id);
    await endSession(req);
    return { message: "Account deleted" };
  }
}
