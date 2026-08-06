import { Router } from "express";
import * as authController from "../controllers/authController.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const authRouter = Router();

authRouter.post("/signup", authController.signUp);
authRouter.post("/signin", authController.signIn);
authRouter.post("/signout", authController.signOut);
authRouter.post("/password-reset/request", authController.requestPasswordReset);
authRouter.post("/password-reset/confirm", authController.resetPassword);
authRouter.delete("/account", requireAuth, authController.deleteAccount);
