import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import ExcelJS from "exceljs";

export interface SavedPrompt {
  id: string;
  savedAt: string;
}

export type FeedbackRating = "Thumbs Up" | "Thumbs Down";

async function loadWorkbook(workbookPath: string): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.read(createReadStream(workbookPath));
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return workbook;
    }
    throw error;
  }
  return workbook;
}

function styleHeader(worksheet: ExcelJS.Worksheet): void {
  worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF37305E" },
  };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
}

function findHeaderColumn(worksheet: ExcelJS.Worksheet, header: string): number | undefined {
  let column: number | undefined;
  worksheet.getRow(1).eachCell((cell, columnNumber) => {
    if (cell.value === header) {
      column = columnNumber;
    }
  });
  return column;
}

function ensureFeedbackColumn(worksheet: ExcelJS.Worksheet): number {
  const headerRow = worksheet.getRow(1);
  let feedbackColumn = findHeaderColumn(worksheet, "Feedback Response");
  if (feedbackColumn === undefined) {
    feedbackColumn = headerRow.cellCount + 1;
    headerRow.getCell(feedbackColumn).value = "Feedback Response";
    worksheet.getColumn(feedbackColumn).width = 100;
    styleHeader(worksheet);
  }
  return feedbackColumn;
}

function ensureUserIdColumn(worksheet: ExcelJS.Worksheet): number {
  const headerRow = worksheet.getRow(1);
  let userIdColumn = findHeaderColumn(worksheet, "User ID");
  if (userIdColumn === undefined) {
    userIdColumn = headerRow.cellCount + 1;
    headerRow.getCell(userIdColumn).value = "User ID";
    worksheet.getColumn(userIdColumn).width = 24;
    styleHeader(worksheet);
  }
  return userIdColumn;
}

export async function appendPromptToWorkbook(
  prompt: string,
  workbookPath: string,
  userId?: string,
): Promise<SavedPrompt> {
  const workbook = await loadWorkbook(workbookPath);
  let worksheet = workbook.getWorksheet("Prompts");
  if (!worksheet) {
    worksheet = workbook.addWorksheet("Prompts");
    worksheet.columns = [
      { header: "Prompt ID", key: "id", width: 38 },
      { header: "Saved At (UTC)", key: "savedAt", width: 28 },
      { header: "Prompt", key: "prompt", width: 100 },
      { header: "Feedback Response", key: "feedbackResponse", width: 100 },
    ];
    styleHeader(worksheet);
  }

  ensureFeedbackColumn(worksheet);
  const userIdColumn = ensureUserIdColumn(worksheet);
  const savedAt = new Date().toISOString();
  const id = randomUUID();
  const row = worksheet.addRow([]);
  row.getCell(1).value = id;
  row.getCell(2).value = savedAt;
  row.getCell(3).value = prompt;
  row.getCell(userIdColumn).value = userId ?? null;

  await mkdir(dirname(workbookPath), { recursive: true });
  await workbook.xlsx.writeFile(workbookPath);
  return { id, savedAt };
}

export async function getPromptHistoryForUser(
  userId: string,
  workbookPath: string,
  maxRows = 100,
): Promise<string[]> {
  const workbook = await loadWorkbook(workbookPath);
  const worksheet = workbook.getWorksheet("Prompts");
  if (!worksheet) {
    return [];
  }

  const promptColumn = findHeaderColumn(worksheet, "Prompt");
  const userIdColumn = findHeaderColumn(worksheet, "User ID");
  if (promptColumn === undefined) {
    throw new Error('The "Prompts" worksheet is missing its "Prompt" column.');
  }
  if (userIdColumn === undefined) {
    return [];
  }

  const history: { rowNumber: number; prompt: string }[] = [];
  worksheet.eachRow((row, rowNumber) => {
    const savedUserId = row.getCell(userIdColumn).value;
    const prompt = row.getCell(promptColumn).value;
    if (
      rowNumber > 1 &&
      savedUserId === userId &&
      typeof prompt === "string" &&
      prompt.trim()
    ) {
      history.push({ rowNumber, prompt });
    }
  });
  return history
    .sort((left, right) => right.rowNumber - left.rowNumber)
    .slice(0, maxRows)
    .map(({ prompt }) => prompt);
}

export async function saveFeedbackToWorkbook(
  promptId: string,
  rating: FeedbackRating,
  workbookPath: string,
): Promise<boolean> {
  const workbook = await loadWorkbook(workbookPath);
  const worksheet = workbook.getWorksheet("Prompts");
  if (!worksheet) {
    return false;
  }

  const promptIdColumn = findHeaderColumn(worksheet, "Prompt ID");
  if (promptIdColumn === undefined) {
    throw new Error('The "Prompts" worksheet is missing its "Prompt ID" column.');
  }
  const feedbackColumn = ensureFeedbackColumn(worksheet);
  let promptRow: ExcelJS.Row | undefined;
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1 && row.getCell(promptIdColumn).value === promptId) {
      promptRow = row;
    }
  });
  if (!promptRow) {
    return false;
  }
  promptRow.getCell(feedbackColumn).value = rating;

  await mkdir(dirname(workbookPath), { recursive: true });
  await workbook.xlsx.writeFile(workbookPath);
  return true;
}
