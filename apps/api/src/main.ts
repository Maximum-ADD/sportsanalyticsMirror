import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import expressFactory from "express";
import helmet from "helmet";
import { auth, allowedOrigins } from "./auth/auth.config.js";
import { AllExceptionsFilter } from "./common/all-exceptions.filter.js";
import { AppModule } from "./app.module.js";

const DEFAULT_PORT = 4000;

async function bootstrap() {
  // Built and wired up manually, then handed to Nest via ExpressAdapter,
  // because NestFactory.create() attaches Nest's own router (including the
  // catch-all NotFoundController) to the Express instance immediately, as
  // part of creating the app — anything added to that instance afterwards,
  // including the BetterAuth handler, would never be reached.
  const server = expressFactory();

  server.use(helmet());
  server.use(
    cors({
      origin: (requestOrigin, callback) => {
        // Allow requests with no Origin (server-to-server, curl, etc.)
        if (!requestOrigin || allowedOrigins.includes(requestOrigin)) {
          callback(null, true);
        } else {
          callback(new Error(`Origin ${requestOrigin} not allowed by CORS`));
        }
      },
      credentials: true,
    })
  );

  // BetterAuth (session cookies, Google OAuth redirects) owns every request
  // under /auth — see auth/auth.config.ts for the basePath. It needs the
  // raw, unparsed body, so it's mounted ahead of express.json().
  server.all("/auth/*splat", toNodeHandler(auth));

  server.use(expressFactory.json());

  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), { bodyParser: false });
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = Number(process.env.PORT) || DEFAULT_PORT;
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}`);
}

bootstrap();
