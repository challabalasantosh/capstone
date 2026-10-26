import assert from "node:assert/strict";
import test from "node:test";
import {
  materializeChart,
  parseReportDraft,
} from "../server/agent";
import type { QueryResult } from "../server/database";

test("parses the report agent JSON response and fenced JSON", () => {
  const report = {
    summary: "Revenue increased.",
    keyPoints: ["Revenue was higher in the latest period."],
    chart: {
      type: "bar",
      title: "Revenue by month",
      xKey: "month",
      yKey: "revenue",
    },
  };

  assert.deepEqual(parseReportDraft(JSON.stringify(report)), report);
  assert.deepEqual(
    parseReportDraft(`\`\`\`json\n${JSON.stringify(report)}\n\`\`\``),
    report,
  );
});

test("rejects invalid report output rather than accepting malformed JSON", () => {
  assert.throws(() => parseReportDraft("not json"));
  assert.throws(() =>
    parseReportDraft(
      JSON.stringify({ summary: "", keyPoints: [], chart: null }),
    ),
  );
});

test("derives chart values from result rows and caps the chart to ten points", () => {
  const query: QueryResult = {
    sql: "SELECT month, revenue FROM invoices",
    rows: Array.from({ length: 12 }, (_, index) => ({
      month: `2026-${index + 1}`,
      revenue: String((index + 1) * 100),
    })),
    rowCount: 12,
    truncated: false,
  };

  assert.deepEqual(
    materializeChart(
      {
        type: "bar",
        title: "Revenue",
        xKey: "month",
        yKey: "revenue",
      },
      query,
    ),
    {
      title: "Revenue",
      xKey: "month",
      yKey: "revenue",
      points: Array.from({ length: 10 }, (_, index) => ({
        label: `2026-${index + 1}`,
        value: (index + 1) * 100,
      })),
    },
  );
});

test("omits charts with missing columns or non-numeric values", () => {
  const query: QueryResult = {
    sql: "SELECT month, revenue FROM invoices",
    rows: [{ month: "2026-01", revenue: "unknown" }],
    rowCount: 1,
    truncated: false,
  };
  const chart = {
    type: "bar" as const,
    title: "Revenue",
    xKey: "month",
    yKey: "revenue",
  };

  assert.equal(materializeChart({ ...chart, xKey: "missing" }, query), null);
  assert.equal(materializeChart(chart, query), null);
});
