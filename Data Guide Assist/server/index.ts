import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import { answerPrompt } from "./agent";
import {
  authenticateUser,
  closeDatabasePool,
  getQueryHistoryForUser,
  saveQueryInteraction,
  updateQueryFeedback,
  type AuthenticatedUser,
} from "./database";
import { findDemoUser } from "./demo-users";
import { validatePrompt } from "./guardrails";
import { suggestPrompts } from "./suggestions-agent";

const HOST = "127.0.0.1";
const DEFAULT_PORT = 3001;
const JSON_BODY_LIMIT = "20kb";
const SESSION_COOKIE = "data_guide_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distPath = resolve(projectRoot, "dist");
const app = express();
const sessions = new Map<string, { user: AuthenticatedUser; expiresAt: number }>();

class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "HttpError";
  }
}

type AsyncRouteHandler = (
  request: Request,
  response: Response,
) => Promise<void>;

function asyncHandler(handler: AsyncRouteHandler): RequestHandler {
  return (request, response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSession(request: Request): {
  user: AuthenticatedUser;
  sessionId: string;
} | undefined {
  const sessionCookie = request.headers.cookie
    ?.split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
  const sessionId = sessionCookie?.slice(SESSION_COOKIE.length + 1);
  if (!sessionId) {
    return undefined;
  }
  const session = sessions.get(sessionId);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return undefined;
  }
  return { user: session.user, sessionId };
}

function requireUser(request: Request): AuthenticatedUser {
  const session = readSession(request);
  if (!session) {
    throw new HttpError(401, "Sign in to continue.");
  }
  return session.user;
}

function isBodyParserError(
  error: unknown,
  type: "entity.parse.failed" | "entity.too.large",
): boolean {
  return isRecord(error) && error.type === type;
}

app.use(express.json({ limit: JSON_BODY_LIMIT }));

app.get("/api/auth/me", (request, response) => {
  response.json({ user: readSession(request)?.user ?? null });
});

app.post(
  "/api/auth/login",
  asyncHandler(async (request, response) => {
    const body = isRecord(request.body) ? request.body : undefined;
    const username = body?.username;
    const password = body?.password;
    if (
      typeof username !== "string" ||
      !username.trim() ||
      username.length > 100 ||
      typeof password !== "string" ||
      !password ||
      password.length > 200
    ) {
      throw new HttpError(400, "Enter a valid username and password.");
    }
    const user = await authenticateUser(username.trim(), password);
    if (!user) {
      throw new HttpError(401, "The username or password is incorrect.");
    }

    const sessionId = randomBytes(32).toString("hex");
    sessions.set(sessionId, { user, expiresAt: Date.now() + SESSION_TTL_MS });
    response.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "strict",
      secure: false,
      path: "/",
      maxAge: SESSION_TTL_MS,
    });
    response.json({ user });
  }),
);

app.post("/api/auth/logout", (request, response) => {
  const session = readSession(request);
  if (session) {
    sessions.delete(session.sessionId);
  }
  response.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "strict",
    secure: false,
    path: "/",
  });
  response.json({ loggedOut: true });
});

app.get(
  "/api/suggestions",
  asyncHandler(async (request, response) => {
    const user = requireUser(request);
    const prompt = request.query.prompt;
    if (
      typeof prompt !== "string" ||
      prompt.length > 500 ||
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(prompt)
    ) {
      throw new HttpError(
        400,
        "Suggestions require a signed-in user and a prompt of at most 500 characters.",
      );
    }

    const demoUser = findDemoUser(user.id);
    if (!demoUser) {
      throw new HttpError(401, "The signed-in user is not available.");
    }
    const savedHistory = await getQueryHistoryForUser(user.id);
    const suggestions = await suggestPrompts(prompt, [
      ...savedHistory,
      ...demoUser.samplePrompts,
    ]);
    response.json({ suggestions });
  }),
);

app.post(
  "/api/prompts",
  asyncHandler(async (request, response) => {
    const user = requireUser(request);
    const body = isRecord(request.body) ? request.body : undefined;

    let prompt: string;
    try {
      prompt = validatePrompt(body?.prompt);
    } catch (error) {
      throw new HttpError(
        400,
        error instanceof Error ? error.message : "Enter a valid prompt.",
        { cause: error },
      );
    }

    let agentAnswer: Awaited<ReturnType<typeof answerPrompt>>;
    try {
      agentAnswer = await answerPrompt(prompt);
    } catch (error) {
      throw new HttpError(
        502,
        "The agent could not answer this request. Check the Ollama endpoint/model, database configuration, and server logs.",
        { cause: error },
      );
    }

    let interaction: Awaited<ReturnType<typeof saveQueryInteraction>>;
    try {
      interaction = await saveQueryInteraction(
        user.id,
        prompt,
        agentAnswer.query?.sql ?? null,
        {
          query: agentAnswer.query,
          analysis: agentAnswer.analysis,
          trace: agentAnswer.workflowTrace,
          report: agentAnswer.report,
        },
      );
    } catch (error) {
      throw new HttpError(
        500,
        "The agent returned a response, but the query history could not be saved to PostgreSQL.",
        { cause: error },
      );
    }

    response.status(201).json({ ...interaction, ...agentAnswer });
  }),
);

app.put(
  "/api/feedback",
  asyncHandler(async (request, response) => {
    const user = requireUser(request);
    const body: unknown = request.body;
    const interactionId = isRecord(body) ? body.interactionId : undefined;
    const rating = isRecord(body) ? body.rating : undefined;
    if (
      typeof interactionId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(interactionId) ||
      (rating !== "Thumbs Up" && rating !== "Thumbs Down")
    ) {
      throw new HttpError(
        400,
        "Feedback must include a valid query ID and rating.",
      );
    }

    let updated: boolean;
    try {
      updated = await updateQueryFeedback(
        user.id,
        interactionId,
        rating,
      );
    } catch (error) {
      throw new HttpError(
        500,
        "Could not update query feedback in PostgreSQL.",
        { cause: error },
      );
    }

    if (!updated) {
      throw new HttpError(404, "The query could not be found for this user.");
    }

    response.status(200).json({ updated: true });
  }),
);

app.use("/api", (_request, _response, next) => {
  next(new HttpError(404, "API endpoint not found."));
});

if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get("*", (_request, response) => {
    response.sendFile(resolve(distPath, "index.html"));
  });
}

const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  next,
) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (isBodyParserError(error, "entity.parse.failed")) {
    response.status(400).json({ error: "Request body must contain valid JSON." });
    return;
  }
  if (isBodyParserError(error, "entity.too.large")) {
    response.status(413).json({ error: "The request is too large." });
    return;
  }

  if (error instanceof HttpError) {
    if (error.statusCode >= 500) {
      console.error("The API request failed:", error);
    }
    response.status(error.statusCode).json({ error: error.message });
    return;
  }

  console.error("An unexpected API error occurred:", error);
  response.status(500).json({ error: "An unexpected server error occurred." });
};

app.use(errorHandler);

function parsePort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_PORT;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  return port;
}

const port = parsePort(process.env.PORT);
const server = app.listen(port, HOST, () => {
  console.log(`Prompt2Insight API listening at http://${HOST}:${port}`);
  if (existsSync(distPath)) {
    console.log(`Production UI: http://${HOST}:${port}`);
  }
});

server.on("error", (error) => {
  console.error("The Prompt2Insight API server failed:", error);
  process.exitCode = 1;
});

let isShuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  console.log(`Received ${signal}; shutting down gracefully.`);

  server.close((error) => {
    if (error) {
      console.error("The API server did not close cleanly:", error);
      process.exitCode = 1;
    }
    void closeDatabasePool()
      .catch((poolError: unknown) => {
        console.error("The PostgreSQL connection pool did not close cleanly:", poolError);
        process.exitCode = 1;
      })
      .finally(() => {
        if (error) {
          process.exitCode = 1;
        }
      });
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
