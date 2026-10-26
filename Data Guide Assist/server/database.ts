import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databaseConfigPath = resolve(projectRoot, "config", "database.json");
const agentConfigPath = resolve(projectRoot, "config", "agent.json");

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
}

interface AgentConfig {
  provider: string;
  baseURL: string;
  apiKey: string;
  model: string;
  maxRows: number;
  statementTimeoutMs: number;
}

export interface QueryResult {
  sql: string;
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
}

export interface AuthenticatedUser {
  id: string;
  username: string;
  name: string;
}

export interface SavedQueryInteraction {
  id: string;
  savedAt: string;
}

export type QueryFeedback = "Thumbs Up" | "Thumbs Down";

export interface WorkflowData {
  query: QueryResult | null;
  analysis: string;
  trace: {
    dataQuery: {
      status: "completed" | "no-query";
      response: string;
      sql: string | null;
      rowCount: number;
      columns: string[];
      truncated: boolean;
    };
    businessAnalysis: {
      status: "completed" | "skipped";
      response: string;
    };
    report: {
      status: "completed" | "skipped";
      summary: string;
      keyPoints: string[];
      chartCreated: boolean;
    };
  };
  report: {
    summary: string;
    keyPoints: string[];
    chart: {
      title: string;
      xKey: string;
      yKey: string;
      points: { label: string; value: number }[];
    } | null;
  };
}

export function limitQueryRows<T>(rows: T[], maxRows: number): {
  rows: T[];
  rowCount: number;
  truncated: boolean;
} {
  const limitedRows = rows.slice(0, maxRows);
  return {
    rows: limitedRows,
    rowCount: limitedRows.length,
    truncated: rows.length > maxRows,
  };
}

type SqlToken = {
  kind: "word" | "number" | "literal" | "symbol";
  value: string;
};

const allowedTables = new Set([
  "product_categories",
  "products",
  "customers",
  "orders",
  "order_items",
  "invoices",
]);
const restrictedColumns = new Set([
  "email",
  "phone",
  "billing_address",
  "shipping_address",
]);
const allowedFunctions = new Set([
  "abs",
  "avg",
  "bool_and",
  "bool_or",
  "cast",
  "ceil",
  "ceiling",
  "coalesce",
  "concat",
  "count",
  "date_part",
  "date_trunc",
  "dense_rank",
  "extract",
  "floor",
  "greatest",
  "lag",
  "least",
  "length",
  "lower",
  "max",
  "min",
  "nullif",
  "rank",
  "round",
  "row_number",
  "string_agg",
  "sum",
  "trim",
  "upper",
]);
const forbiddenKeywords = new Set([
  "analyze",
  "alter",
  "call",
  "comment",
  "copy",
  "create",
  "deallocate",
  "delete",
  "do",
  "drop",
  "execute",
  "grant",
  "insert",
  "into",
  "lock",
  "merge",
  "prepare",
  "refresh",
  "revoke",
  "set",
  "truncate",
  "update",
  "vacuum",
]);
const fromClauseEndKeywords = new Set([
  "except",
  "fetch",
  "for",
  "group",
  "having",
  "intersect",
  "limit",
  "offset",
  "order",
  "union",
  "where",
  "window",
]);
const tableAliasTerminators = new Set([
  "as",
  "cross",
  "except",
  "fetch",
  "for",
  "full",
  "group",
  "having",
  "inner",
  "intersect",
  "join",
  "left",
  "limit",
  "natural",
  "offset",
  "on",
  "order",
  "outer",
  "right",
  "union",
  "using",
  "where",
  "window",
]);
const sqlSyntaxWithParentheses = new Set([
  "and",
  "any",
  "as",
  "case",
  "exists",
  "in",
  "not",
  "or",
  "select",
  "some",
  "when",
]);

let pool: pg.Pool | undefined;
let poolConfigKey: string | undefined;

async function readJsonFile<T>(path: string, description: string): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      throw new Error(
        `${description} is missing. Copy config/database.example.json to config/database.json and edit its values.`,
      );
    }
    throw error;
  }
}

export async function loadAgentConfig(): Promise<AgentConfig> {
  const config = await readJsonFile<AgentConfig>(agentConfigPath, "Agent config");
  if (
    config.provider !== "openai-compatible" ||
    typeof config.baseURL !== "string" ||
    !config.baseURL.trim() ||
    typeof config.apiKey !== "string" ||
    !config.apiKey.trim() ||
    typeof config.model !== "string" ||
    !config.model.trim() ||
    !Number.isInteger(config.maxRows) ||
    config.maxRows < 1 ||
    config.maxRows > 1000 ||
    !Number.isInteger(config.statementTimeoutMs) ||
    config.statementTimeoutMs < 100 ||
    config.statementTimeoutMs > 120_000
  ) {
    throw new Error("config/agent.json must define a valid OpenAI-compatible provider, URL, API key, model, and query limits.");
  }
  try {
    const endpoint = new URL(config.baseURL);
    if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
      throw new Error("Unsupported protocol.");
    }
  } catch (error) {
    throw new Error("config/agent.json baseURL must be a valid HTTP or HTTPS URL.", {
      cause: error,
    });
  }
  return config;
}

async function getPool(): Promise<pg.Pool> {
  const config = await readJsonFile<DatabaseConfig>(databaseConfigPath, "Database config");
  if (
    typeof config.host !== "string" ||
    !config.host.trim() ||
    !Number.isInteger(config.port) ||
    config.port < 1 ||
    config.port > 65535 ||
    typeof config.database !== "string" ||
    !config.database.trim() ||
    typeof config.user !== "string" ||
    !config.user.trim() ||
    typeof config.password !== "string" ||
    typeof config.ssl !== "boolean"
  ) {
    throw new Error("config/database.json contains invalid PostgreSQL connection settings.");
  }

  const configKey = JSON.stringify(config);
  if (!pool || poolConfigKey !== configKey) {
    if (pool) {
      await pool.end();
    }
    pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl,
      max: 5,
      connectionTimeoutMillis: 5000,
    });
    poolConfigKey = configKey;
  }
  return pool;
}

export async function authenticateUser(
  username: string,
  password: string,
): Promise<AuthenticatedUser | null> {
  const connectionPool = await getPool();
  const result = await connectionPool.query<{
    username: string;
    display_name: string;
  }>(
    `SELECT username, display_name
     FROM public.authenticate_app_user($1, $2)`,
    [username, password],
  );
  const user = result.rows[0];
  return user
    ? { id: user.username, username: user.username, name: user.display_name }
    : null;
}

export async function getQueryHistoryForUser(
  userId: string,
  maxRows = 100,
): Promise<string[]> {
  const connectionPool = await getPool();
  const result = await connectionPool.query<{ input_text: string }>(
    `SELECT input_text
     FROM query_feedback
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, maxRows],
  );
  return result.rows.map(({ input_text }) => input_text);
}

export async function saveQueryInteraction(
  userId: string,
  inputText: string,
  generatedQuery: string | null,
  workflowData: WorkflowData,
): Promise<SavedQueryInteraction> {
  const connectionPool = await getPool();
  const result = await connectionPool.query<{ id: string; created_at: Date }>(
    `INSERT INTO query_feedback (user_id, input_text, generated_query, workflow_data)
     VALUES ($1, $2, $3, $4)
     RETURNING query_id AS id, created_at`,
    [userId, inputText, generatedQuery, JSON.stringify(workflowData)],
  );
  const interaction = result.rows[0];
  if (!interaction) {
    throw new Error("PostgreSQL did not return the saved query interaction.");
  }
  return {
    id: interaction.id,
    savedAt: interaction.created_at.toISOString(),
  };
}

export async function updateQueryFeedback(
  userId: string,
  interactionId: string,
  feedback: QueryFeedback,
): Promise<boolean> {
  const connectionPool = await getPool();
  const result = await connectionPool.query(
    `UPDATE query_feedback
     SET feedback = $3, feedback_updated_at = CURRENT_TIMESTAMP
     WHERE query_id = $1 AND user_id = $2`,
    [interactionId, userId, feedback],
  );
  return result.rowCount === 1;
}

function tokenizeQuery(query: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  for (let index = 0; index < query.length;) {
    const character = query[index];
    if (query.startsWith("--", index) || query.startsWith("/*", index) ||
      query.startsWith("*/", index)) {
      throw new Error("Only a single, read-only SELECT query is allowed.");
    }
    if (/\s/.test(character)) {
      index++;
      continue;
    }
    if (character === "'") {
      let literal = "";
      index++;
      let closed = false;
      while (index < query.length) {
        if (query[index] === "'" && query[index + 1] === "'") {
          literal += "'";
          index += 2;
        } else if (query[index] === "'") {
          index++;
          closed = true;
          break;
        } else if (query[index] === "\\") {
          throw new Error("Only a single, read-only SELECT query is allowed.");
        } else {
          literal += query[index];
          index++;
        }
      }
      if (!closed) {
        throw new Error("Only a single, read-only SELECT query is allowed.");
      }
      tokens.push({ kind: "literal", value: literal });
      continue;
    }
    if (/[A-Za-z_]/.test(character)) {
      const start = index++;
      while (index < query.length && /[A-Za-z0-9_$]/.test(query[index])) {
        index++;
      }
      tokens.push({ kind: "word", value: query.slice(start, index).toLowerCase() });
      continue;
    }
    if (/[0-9]/.test(character)) {
      const start = index++;
      while (index < query.length && /[0-9.]/.test(query[index])) {
        index++;
      }
      tokens.push({ kind: "number", value: query.slice(start, index) });
      continue;
    }
    if ("(),.*=<>!+-/%[]:~^|&?".includes(character)) {
      tokens.push({ kind: "symbol", value: character });
      index++;
      continue;
    }
    throw new Error("Only a single, read-only SELECT query is allowed.");
  }
  return tokens;
}

function validateTableReference(tokens: SqlToken[], index: number): {
  alias: string;
  declarationIndex: number;
} {
  let tableIndex = index + 1;
  if (tokens[tableIndex]?.kind !== "word") {
    throw new Error("Only queries against the approved application tables are allowed.");
  }

  let tableName = tokens[tableIndex].value;
  if (tokens[tableIndex + 1]?.value === ".") {
    if (tableName !== "public" || tokens[tableIndex + 2]?.kind !== "word") {
      throw new Error("Only queries against the approved application tables are allowed.");
    }
    tableName = tokens[tableIndex + 2].value;
    tableIndex += 2;
  }
  if (!allowedTables.has(tableName)) {
    throw new Error("Only queries against the approved application tables are allowed.");
  }
  const aliasToken = tokens[tableIndex + 1];
  const aliasIndex = aliasToken?.value === "as" ? tableIndex + 2 : tableIndex + 1;
  const alias = tokens[aliasIndex];
  if (alias?.kind === "word" && (aliasToken?.value === "as" ||
    !tableAliasTerminators.has(alias.value))) {
    return { alias: alias.value, declarationIndex: aliasIndex };
  }
  return { alias: tableName, declarationIndex: tableIndex };
}

export function validateReadOnlyQuery(sql: string): string {
  const input = sql.trim();
  const query = input.endsWith(";") ? input.slice(0, -1).trim() : input;
  if (query.length === 0 || query.length > 10_000) {
    throw new Error("Only a single, read-only SELECT query is allowed.");
  }

  const tokens = tokenizeQuery(query);
  if (tokens[0]?.kind !== "word" || tokens[0].value !== "select") {
    throw new Error("Only a single, read-only SELECT query is allowed.");
  }

  let tableReferenceCount = 0;
  const rowAliases = new Map<string, Set<number>>();
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.kind !== "word") {
      continue;
    }
    if (forbiddenKeywords.has(token.value)) {
      throw new Error("Only a single, read-only SELECT query is allowed.");
    }
    if (restrictedColumns.has(token.value)) {
      throw new Error("Queries cannot access customer contact or address fields.");
    }
    if (token.value === "from" || token.value === "join") {
      const reference = validateTableReference(tokens, index);
      const declarationIndexes = rowAliases.get(reference.alias) ?? new Set<number>();
      declarationIndexes.add(reference.declarationIndex);
      rowAliases.set(reference.alias, declarationIndexes);
      tableReferenceCount++;
    }
    if (tokens[index + 1]?.value === "(") {
      if (!sqlSyntaxWithParentheses.has(token.value) && !allowedFunctions.has(token.value)) {
        throw new Error(`The SQL function "${token.value}" is not allowed.`);
      }
    }
    if (tokens[index + 1]?.value === "." && tokens[index + 2]?.kind === "word" &&
      tokens[index + 3]?.value === "(") {
      throw new Error("Schema-qualified SQL functions are not allowed.");
    }
  }

  if (tableReferenceCount === 0) {
    throw new Error("Queries must read from an approved application table.");
  }

  for (let index = 0; index < tokens.length; index++) {
    const declarationIndexes = rowAliases.get(tokens[index].value);
    if (
      declarationIndexes &&
      !declarationIndexes.has(index) &&
      tokens[index + 1]?.value !== "."
    ) {
      throw new Error("Select explicit columns instead of returning an entire table row.");
    }
  }

  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index].value !== "*") {
      continue;
    }
    const previous = tokens[index - 1]?.value;
    const next = tokens[index + 1]?.value;
    const multiplication =
      (tokens[index - 1]?.kind === "word" ||
        tokens[index - 1]?.kind === "number" ||
        previous === ")") &&
      (tokens[index + 1]?.kind === "word" ||
        tokens[index + 1]?.kind === "number" ||
        next === "(") &&
      !["select", "distinct", "from"].includes(previous ?? "") &&
      !["from", "where", "group", "order", "limit"].includes(next ?? "");
    if (
      (previous === "(" && next === ")" &&
        tokens[index - 2]?.value === "count") ||
      multiplication
    ) {
      continue;
    }
    throw new Error("Wildcard columns are not allowed; select only the fields you need.");
  }

  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index].value !== "from") {
      continue;
    }
    let depth = 0;
    for (let cursor = index + 1; cursor < tokens.length; cursor++) {
      const value = tokens[cursor].value;
      if (depth === 0 && fromClauseEndKeywords.has(value)) {
        break;
      }
      if (value === "(") {
        depth++;
      } else if (value === ")") {
        depth--;
      } else if (value === "," && depth === 0) {
        throw new Error("Comma-separated FROM clauses are not allowed; use explicit JOINs.");
      }
    }
  }
  return query;
}

export async function queryDatabase(sql: string): Promise<QueryResult> {
  const safeSql = validateReadOnlyQuery(sql);
  const [agentConfig, connectionPool] = await Promise.all([
    loadAgentConfig(),
    getPool(),
  ]);
  const client = await connectionPool.connect();
  let transactionStarted = false;
  let connectionError: Error | undefined;
  try {
    await client.query("BEGIN READ ONLY");
    transactionStarted = true;
    await client.query(
      "SELECT set_config('statement_timeout', $1, true)",
      [`${agentConfig.statementTimeoutMs}ms`],
    );
    const result = await client.query(
      `SELECT * FROM (${safeSql}) AS agent_result LIMIT $1`,
      [agentConfig.maxRows + 1],
    );
    await client.query("COMMIT");
    transactionStarted = false;
    const limitedResult = limitQueryRows(result.rows, agentConfig.maxRows);
    return {
      sql: safeSql,
      ...limitedResult,
    };
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        connectionError = rollbackError instanceof Error
          ? rollbackError
          : new Error("PostgreSQL transaction rollback failed.", {
            cause: rollbackError,
          });
        throw new AggregateError(
          [error, rollbackError],
          "The database query failed and its transaction could not be rolled back.",
          { cause: error },
        );
      }
    }
    throw error;
  } finally {
    client.release(connectionError);
  }
}

export async function closeDatabasePool(): Promise<void> {
  const currentPool = pool;
  pool = undefined;
  poolConfigKey = undefined;
  if (currentPool) {
    await currentPool.end();
  }
}
