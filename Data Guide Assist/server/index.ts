import { existsSync } from "node:fs";
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
import { closeDatabasePool } from "./database";
import {
  appendPromptToWorkbook,
  saveFeedbackToWorkbook,
} from "./excel-store";
import { validatePrompt } from "./guardrails";

const HOST = "127.0.0.1";
const DEFAULT_PORT = 3001;
const JSON_BODY_LIMIT = "20kb";
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workbookPath = resolve(projectRoot, "data", "prompts.xlsx");
const distPath = resolve(projectRoot, "dist");
const app = express();
let workbookWriteQueue: Promise<void> = Promise.resolve();

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

function enqueueWorkbookWrite<T>(write: () => Promise<T>): Promise<T> {
  const operation = workbookWriteQueue.then(write);
  workbookWriteQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

function isBodyParserError(
  error: unknown,
  type: "entity.parse.failed" | "entity.too.large",
): boolean {
  return isRecord(error) && error.type === type;
}

app.use(express.json({ limit: JSON_BODY_LIMIT }));

app.post(
  "/api/prompts",
  asyncHandler(async (request, response) => {
    let prompt: string;
    try {
      prompt = validatePrompt(
        isRecord(request.body) ? request.body.prompt : undefined,
      );
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

    let savedPrompt: Awaited<ReturnType<typeof appendPromptToWorkbook>>;
    try {
      savedPrompt = await enqueueWorkbookWrite(() =>
        appendPromptToWorkbook(prompt, workbookPath),
      );
    } catch (error) {
      throw new HttpError(
        500,
        "The agent returned a response, but it could not be saved to Excel. Check that data/prompts.xlsx is writable.",
        { cause: error },
      );
    }

    response.status(201).json({ ...savedPrompt, ...agentAnswer });
  }),
);

app.post(
  "/api/feedback",
  asyncHandler(async (request, response) => {
    const body: unknown = request.body;
    const promptId = isRecord(body) ? body.promptId : undefined;
    const rating = isRecord(body) ? body.rating : undefined;
    if (
      typeof promptId !== "string" ||
      !promptId.trim() ||
      promptId.length > 100 ||
      (rating !== "Thumbs Up" && rating !== "Thumbs Down")
    ) {
      throw new HttpError(
        400,
        "Feedback must include a valid prompt ID and rating.",
      );
    }

    let savedFeedback: boolean;
    try {
      savedFeedback = await enqueueWorkbookWrite(() =>
        saveFeedbackToWorkbook(promptId.trim(), rating, workbookPath),
      );
    } catch (error) {
      throw new HttpError(
        500,
        "Could not save feedback to Excel. Check that data/prompts.xlsx is writable.",
        { cause: error },
      );
    }

    if (!savedFeedback) {
      throw new HttpError(404, "The prompt could not be found in the workbook.");
    }

    response.status(201).json(savedFeedback);
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
  console.log(`Data Guide Assist API listening at http://${HOST}:${port}`);
  console.log(`Workbook: ${workbookPath}`);
  if (existsSync(distPath)) {
    console.log(`Production UI: http://${HOST}:${port}`);
  }
});

server.on("error", (error) => {
  console.error("The Data Guide Assist API server failed:", error);
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
