import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import ExcelJS from "exceljs";
import {
  appendPromptToWorkbook,
  getPromptHistoryForUser,
  saveFeedbackToWorkbook,
} from "../server/excel-store";

test("appends new prompts to existing workbook rows", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "data-guide-assist-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const workbookPath = join(directory, "prompts.xlsx");
  const prompts = ["First prompt", "Second prompt", "Third prompt"];
  const saved = [];
  for (const prompt of prompts) {
    saved.push(await appendPromptToWorkbook(prompt, workbookPath));
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);
  const worksheet = workbook.getWorksheet("Prompts");

  assert.equal(worksheet?.rowCount, prompts.length + 1);
  assert.deepEqual(
    prompts.map((_, index) => worksheet?.getRow(index + 2).getCell(3).value),
    prompts,
  );
  assert.equal(new Set(saved.map(({ id }) => id)).size, prompts.length);
  assert.ok(saved.every(({ savedAt }) => Number.isFinite(Date.parse(savedAt))));
});

test("stores thumbs-up and thumbs-down feedback in their prompt rows", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "data-guide-assist-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const workbookPath = join(directory, "prompts.xlsx");
  const savedPrompts = [
    await appendPromptToWorkbook("Explain this dataset", workbookPath),
    await appendPromptToWorkbook("Summarize this table", workbookPath),
  ];
  assert.equal(
    await saveFeedbackToWorkbook(
      savedPrompts[0].id,
      "Thumbs Up",
      workbookPath,
    ),
    true,
  );
  assert.equal(
    await saveFeedbackToWorkbook(
      savedPrompts[1].id,
      "Thumbs Down",
      workbookPath,
    ),
    true,
  );
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);
  const worksheet = workbook.getWorksheet("Prompts");
  let feedbackColumn: number | undefined;
  worksheet?.getRow(1).eachCell((cell, columnNumber) => {
    if (cell.value === "Feedback Response") {
      feedbackColumn = columnNumber;
    }
  });

  assert.equal(worksheet?.rowCount, 3);
  assert.equal(feedbackColumn, 4);
  assert.equal(
    worksheet?.getRow(2).getCell(feedbackColumn ?? 0).value,
    "Thumbs Up",
  );
  assert.equal(
    worksheet?.getRow(3).getCell(feedbackColumn ?? 0).value,
    "Thumbs Down",
  );
  assert.equal(await saveFeedbackToWorkbook("unknown-id", "Thumbs Down", workbookPath), false);
});

test("keeps saved prompt histories separate by user", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "data-guide-assist-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const workbookPath = join(directory, "prompts.xlsx");
  await appendPromptToWorkbook("First sales question", workbookPath, "sales");
  await appendPromptToWorkbook("Catalog question", workbookPath, "catalog");
  await appendPromptToWorkbook("Second sales question", workbookPath, "sales");

  assert.deepEqual(await getPromptHistoryForUser("sales", workbookPath), [
    "Second sales question",
    "First sales question",
  ]);
  assert.deepEqual(await getPromptHistoryForUser("catalog", workbookPath), [
    "Catalog question",
  ]);
});

test("adds feedback column to an existing prompt workbook", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "data-guide-assist-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const workbookPath = join(directory, "prompts.xlsx");
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Prompts");
  worksheet.addRow(["Prompt ID", "Saved At (UTC)", "Prompt"]);
  worksheet.addRow(["existing-prompt", new Date().toISOString(), "Already saved"]);
  await workbook.xlsx.writeFile(workbookPath);

  assert.equal(
    await saveFeedbackToWorkbook("existing-prompt", "Thumbs Down", workbookPath),
    true,
  );
  await workbook.xlsx.readFile(workbookPath);
  const updatedWorksheet = workbook.getWorksheet("Prompts");

  assert.equal(updatedWorksheet?.getRow(1).getCell(4).value, "Feedback Response");
  assert.equal(updatedWorksheet?.getRow(2).getCell(4).value, "Thumbs Down");
});

test("does not treat a corrupt workbook as a new workbook", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "data-guide-assist-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const workbookPath = join(directory, "prompts.xlsx");
  await writeFile(workbookPath, "not an Excel workbook");

  await assert.rejects(
    appendPromptToWorkbook("Keep existing workbook data safe", workbookPath),
  );
});
