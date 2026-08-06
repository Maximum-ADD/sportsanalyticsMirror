import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import cors from "cors";
import session from "express-session";
import helmet from "helmet";
import passport from "passport";
import { AllExceptionsFilter } from "./common/all-exceptions.filter.js";
import { AppModule } from "./app.module.js";

const SESSION_COOKIE_MAX_AGE_IN_MILLISECONDS = 1000 * 60 * 60 * 24 * 7; // 7 days
const DEFAULT_PORT = 4000;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  });
  app.use(cookieParser());
  app.use(
    session({
      secret: process.env.SESSION_SECRET ?? "dev-secret-change-me",
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: "lax", maxAge: SESSION_COOKIE_MAX_AGE_IN_MILLISECONDS },
    })
  );
  app.use(passport.initialize());
  app.use(passport.session());

  app.useGlobalFilters(new AllExceptionsFilter());

  const port = Number(process.env.PORT) || DEFAULT_PORT;
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}`);
}

bootstrap();
