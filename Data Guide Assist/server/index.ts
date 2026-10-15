import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express, { type ErrorRequestHandler } from "express";
import {
  appendPromptToWorkbook,
  saveFeedbackToWorkbook,
} from "./excel-store";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workbookPath = resolve(projectRoot, "data", "prompts.xlsx");
const distPath = resolve(projectRoot, "dist");
const maxPromptLength = 10_000;
const app = express();
let writeQueue = Promise.resolve();

function enqueueWrite<T>(write: () => Promise<T>): Promise<T> {
  const operation = writeQueue.then(write);
  writeQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

app.use(express.json({ limit: "20kb" }));

app.post("/api/prompts", async (request, response) => {
  const body: unknown = request.body;
  const prompt = isRecord(body) ? body.prompt : undefined;
  if (typeof prompt !== "string" || !prompt.trim()) {
    return response.status(400).json({ error: "Enter a prompt before saving." });
  }
  if (prompt.length > maxPromptLength) {
    return response.status(400).json({
      error: `Prompts must be ${maxPromptLength.toLocaleString()} characters or fewer.`,
    });
  }

  const trimmedPrompt = prompt.trim();
  try {
    const savedPrompt = await enqueueWrite(() =>
      appendPromptToWorkbook(trimmedPrompt, workbookPath),
    );
    return response.status(201).json(savedPrompt);
  } catch (error) {
    console.error("Failed to save prompt to the Excel workbook:", error);
    return response.status(500).json({
      error: "Could not save the prompt to Excel. Check that data/prompts.xlsx is writable.",
    });
  }
});

app.post("/api/feedback", async (request, response) => {
  const body: unknown = request.body;
  const promptId = isRecord(body) ? body.promptId : undefined;
  const rating = isRecord(body) ? body.rating : undefined;
  if (
    typeof promptId !== "string" ||
    !promptId.trim() ||
    promptId.length > 100 ||
    (rating !== "Thumbs Up" && rating !== "Thumbs Down")
  ) {
    return response.status(400).json({ error: "Feedback must include a valid prompt ID and rating." });
  }

  try {
    const savedFeedback = await enqueueWrite(() =>
      saveFeedbackToWorkbook(
        promptId.trim(),
        rating,
        workbookPath,
      ),
    );
    if (!savedFeedback) {
      return response.status(404).json({ error: "The prompt could not be found in the workbook." });
    }
    return response.status(201).json(savedFeedback);
  } catch (error) {
    console.error("Failed to save feedback to the prompt Excel workbook:", error);
    return response.status(500).json({
      error: "Could not save feedback to Excel. Check that data/prompts.xlsx is writable.",
    });
  }
});

const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
  if (error instanceof SyntaxError && "body" in error) {
    return response.status(400).json({ error: "Request body must contain valid JSON." });
  }
  if (isRecord(error) && error.type === "entity.too.large") {
    return response.status(413).json({ error: "The request is too large." });
  }
  return next(error);
};

app.use(errorHandler);

app.use("/api", (request, response) => {
  return response.status(404).json({ error: "API endpoint not found." });
});

if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get("*", (request, response) => {
    return response.sendFile(resolve(distPath, "index.html"));
  });
}

const port = Number(process.env.PORT || 3001);
app.listen(port, "127.0.0.1", () => {
  console.log(`Prompt Excel API listening at http://127.0.0.1:${port}`);
  console.log(`Workbook: ${workbookPath}`);
  if (existsSync(distPath)) {
    console.log(`Production UI: http://127.0.0.1:${port}`);
  }
});
