import assert from "node:assert/strict";
import test from "node:test";
import { suggestPrompts } from "../server/suggestions-agent";

test("recommends matching prompts from the selected user's history", async () => {
  const suggestions = await suggestPrompts("orders", [
    "Show overdue invoices",
    "How many orders were placed this month?",
    "List active products by category",
    "Which customers have placed the most orders?",
  ]);

  assert.deepEqual(suggestions, [
    "How many orders were placed this month?",
    "Which customers have placed the most orders?",
  ]);
});

test("shows recent history when the prompt is empty and caps suggestions", async () => {
  const suggestions = await suggestPrompts("", [
    "First question",
    "Second question",
    "Third question",
    "Fourth question",
  ]);

  assert.deepEqual(suggestions, [
    "First question",
    "Second question",
    "Third question",
  ]);
});

test("returns no suggestions when the typed topic is not in user history", async () => {
  assert.deepEqual(
    await suggestPrompts("invoices", ["List active products by category"]),
    [],
  );
});
