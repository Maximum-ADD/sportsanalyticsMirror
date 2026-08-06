import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import session from "express-session";
import { passport } from "./lib/passport.js";
import { authRouter } from "./routes/auth.js";
import { v1Router } from "./routes/v1.js";
import { handleNotFound, handleError } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(cookieParser());
  app.use(
    session({
      secret: process.env.SESSION_SECRET ?? "dev-secret-change-me",
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: "lax", maxAge: 1000 * 60 * 60 * 24 * 7 },
    })
  );
  app.use(passport.initialize());
  app.use(passport.session());

  app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

  app.use("/auth", authRouter);
  app.use("/v1", v1Router);

  app.use(handleNotFound);
  app.use(handleError);

  return app;
}
