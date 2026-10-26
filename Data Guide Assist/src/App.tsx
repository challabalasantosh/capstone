import {
  useEffect,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

interface SignedInUser {
  id: string;
  username: string;
  name: string;
}
interface SavedPrompt {
  id: string;
  savedAt: string;
}

interface PromptResult extends SavedPrompt {
  prompt: string;
  answer: string;
  analysis: string;
  report: AgentReport;
  workflowTrace: AgentWorkflowTrace;
  query: {
    sql: string;
    rows: Record<string, unknown>[];
    rowCount: number;
    truncated: boolean;
  } | null;
}

interface AgentReport {
  summary: string;
  keyPoints: string[];
  chart: {
    title: string;
    xKey: string;
    yKey: string;
    points: { label: string; value: number }[];
  } | null;
}

interface AgentWorkflowTrace {
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
}

type FeedbackState = "saving" | "positive" | "negative" | null;
interface PromptResponse extends SavedPrompt {
  answer: string;
  analysis: string;
  report: AgentReport;
  workflowTrace: AgentWorkflowTrace;
  query: PromptResult["query"];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSignedInUser(value: unknown): SignedInUser {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.username !== "string" ||
    typeof value.name !== "string"
  ) {
    throw new Error("The server returned an invalid signed-in user.");
  }
  return { id: value.id, username: value.username, name: value.name };
}

function parseSuggestionsResponse(value: unknown): string[] {
  if (
    !isRecord(value) ||
    !Array.isArray(value.suggestions) ||
    !value.suggestions.every((suggestion) => typeof suggestion === "string")
  ) {
    throw new Error("The server returned invalid prompt suggestions.");
  }
  return value.suggestions;
}

function isQueryResult(
  value: unknown,
): value is NonNullable<PromptResult["query"]> {
  return (
    isRecord(value) &&
    typeof value.sql === "string" &&
    Array.isArray(value.rows) &&
    value.rows.every(isRecord) &&
    typeof value.rowCount === "number" &&
    Number.isInteger(value.rowCount) &&
    typeof value.truncated === "boolean"
  );
}

function isAgentReport(value: unknown): value is AgentReport {
  if (
    !isRecord(value) ||
    typeof value.summary !== "string" ||
    !Array.isArray(value.keyPoints) ||
    !value.keyPoints.every((point) => typeof point === "string")
  ) {
    return false;
  }
  if (value.chart === null) {
    return true;
  }
  return (
    isRecord(value.chart) &&
    typeof value.chart.title === "string" &&
    typeof value.chart.xKey === "string" &&
    typeof value.chart.yKey === "string" &&
    Array.isArray(value.chart.points) &&
    value.chart.points.every(
      (point) =>
        isRecord(point) &&
        typeof point.label === "string" &&
        typeof point.value === "number" &&
        Number.isFinite(point.value),
    )
  );
}

function isAgentWorkflowTrace(value: unknown): value is AgentWorkflowTrace {
  return (
    isRecord(value) &&
    isRecord(value.dataQuery) &&
    (value.dataQuery.status === "completed" ||
      value.dataQuery.status === "no-query") &&
    typeof value.dataQuery.response === "string" &&
    (typeof value.dataQuery.sql === "string" ||
      value.dataQuery.sql === null) &&
    typeof value.dataQuery.rowCount === "number" &&
    Array.isArray(value.dataQuery.columns) &&
    value.dataQuery.columns.every((column) => typeof column === "string") &&
    typeof value.dataQuery.truncated === "boolean" &&
    isRecord(value.businessAnalysis) &&
    (value.businessAnalysis.status === "completed" ||
      value.businessAnalysis.status === "skipped") &&
    typeof value.businessAnalysis.response === "string" &&
    isRecord(value.report) &&
    (value.report.status === "completed" ||
      value.report.status === "skipped") &&
    typeof value.report.summary === "string" &&
    Array.isArray(value.report.keyPoints) &&
    value.report.keyPoints.every((point) => typeof point === "string") &&
    typeof value.report.chartCreated === "boolean"
  );
}

function parsePromptResponse(value: unknown): PromptResponse {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.savedAt !== "string" ||
    typeof value.answer !== "string" ||
    typeof value.analysis !== "string" ||
    !isAgentReport(value.report) ||
    !isAgentWorkflowTrace(value.workflowTrace) ||
    !(value.query === null || isQueryResult(value.query))
  ) {
    throw new Error("The server returned an invalid prompt response.");
  }
  return {
    id: value.id,
    savedAt: value.savedAt,
    answer: value.answer,
    analysis: value.analysis,
    report: value.report,
    workflowTrace: value.workflowTrace,
    query: value.query,
  };
}

async function readApiResponse(response: Response): Promise<unknown> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if (!response.ok) {
      throw new Error(`The request failed with status ${response.status}.`, {
        cause: error,
      });
    }
    throw new Error("The server returned an invalid response.", { cause: error });
  }
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `The request failed with status ${response.status}.`;
    throw new Error(message);
  }
  return payload;
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z" />
      <path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" />
    </svg>
  );
}

function FeedbackIcon({ positive }: { positive: boolean }) {
  return positive ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 10v11H3V10h4Zm2 11h8.2a2 2 0 0 0 1.96-1.6l1.5-7.5A2 2 0 0 0 18.7 9H14l.7-3.1A2.4 2.4 0 0 0 12.35 3L9 8.5V21Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17 14V3h4v11h-4Zm-2-11H6.8a2 2 0 0 0-1.96 1.6l-1.5 7.5A2 2 0 0 0 5.3 14H10l-.7 3.1A2.4 2.4 0 0 0 11.65 20L15 14.5V3Z" />
    </svg>
  );
}

function App() {
  const [signedInUser, setSignedInUser] = useState<SignedInUser | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [suggestionError, setSuggestionError] = useState("");
  const [result, setResult] = useState<PromptResult | null>(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [feedbackError, setFeedbackError] = useState("");

  useEffect(() => {
    let isCurrent = true;
    async function restoreSession() {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "same-origin",
        });
        const payload = await readApiResponse(response);
        if (!isRecord(payload) || !("user" in payload)) {
          throw new Error("The server returned an invalid sign-in status.");
        }
        if (isCurrent) {
          setSignedInUser(
            payload.user === null ? null : parseSignedInUser(payload.user),
          );
        }
      } catch (requestError) {
        if (isCurrent) {
          setLoginError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to check your sign-in status.",
          );
        }
      } finally {
        if (isCurrent) setIsCheckingSession(false);
      }
    }
    void restoreSession();
    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (!signedInUser) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsLoadingSuggestions(true);
      setSuggestionError("");
      try {
        const query = new URLSearchParams({ prompt: prompt.slice(0, 500) });
        const response = await fetch(`/api/suggestions?${query}`, {
          signal: controller.signal,
          credentials: "same-origin",
        });
        setSuggestions(
          parseSuggestionsResponse(await readApiResponse(response)),
        );
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setSuggestionError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to load suggestions.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingSuggestions(false);
        }
      }
    }, 250);
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [prompt, signedInUser]);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError("");
    setIsLoggingIn(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username, password }),
      });
      const payload = await readApiResponse(response);
      if (!isRecord(payload)) {
        throw new Error("The server returned an invalid sign-in response.");
      }
      const user = parseSignedInUser(payload.user);
      setSignedInUser(user);
      setPassword("");
      setPrompt("");
      setResult(null);
      setError("");
    } catch (requestError) {
      setLoginError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to sign in.",
      );
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function logout() {
    setError("");
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      await readApiResponse(response);
      setSignedInUser(null);
      setResult(null);
      setPrompt("");
      setFeedback(null);
      setUsername("");
      setPassword("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to sign out.",
      );
    }
  }

  async function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedPrompt = prompt.trim();
    if (!submittedPrompt) {
      setError("Add a prompt to get started.");
      setResult(null);
      return;
    }

    setError("");
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ prompt: submittedPrompt }),
      });
      const payload = parsePromptResponse(await readApiResponse(response));

      setResult({
        id: payload.id,
        prompt: submittedPrompt,
        savedAt: payload.savedAt,
        answer: payload.answer,
        analysis: payload.analysis,
        report: payload.report,
        workflowTrace: payload.workflowTrace,
        query: payload.query,
      });
      setFeedback(null);
      setFeedbackError("");
    } catch (requestError) {
      setResult(null);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to get an answer. Check that the local server is running and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function useSuggestion(suggestion: string) {
    setPrompt(suggestion);
    setError("");
  }

  async function submitFeedback(positive: boolean) {
    if (!result || feedback === "saving") return;
    const previousFeedback = feedback;
    setFeedbackError("");
    setFeedback("saving");
    try {
      const response = await fetch("/api/feedback", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          interactionId: result.id,
          rating: positive ? "Thumbs Up" : "Thumbs Down",
        }),
      });
      await readApiResponse(response);
      setFeedback(positive ? "positive" : "negative");
    } catch (requestError) {
      setFeedback(previousFeedback);
      setFeedbackError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to save feedback. Check that the local server is running and try again.",
      );
    }
  }

  if (isCheckingSession) {
    return (
      <main className="login-shell">
        <div className="login-card login-card-loading"><p role="status">Checking your sign-in...</p></div>
      </main>
    );
  }

  if (!signedInUser) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="login-showcase">
            <a className="brand login-brand" href="/" aria-label="Prompt2Insight home">
              <span className="brand-mark"><SparkleIcon /></span>
              <span>Prompt<span className="brand-light">2</span>Insight</span>
            </a>
            <div className="showcase-copy">
              <div className="showcase-label">INTELLIGENCE, MADE ACCESSIBLE</div>
              <h1>Move from business questions to confident decisions.</h1>
              <p>Explore trusted data through clear answers, transparent queries, and decision-ready insights.</p>
            </div>
            <div className="showcase-capabilities">
              <div><span>01</span><p>Ask in plain language</p></div>
              <div><span>02</span><p>Ground insights in your data</p></div>
              <div><span>03</span><p>Review every result</p></div>
            </div>
            <div className="showcase-footer">SECURE WORKSPACE <span>·</span> READ-ONLY DATA ACCESS</div>
          </div>
          <div className="login-panel">
            <div className="login-heading">
              <div className="eyebrow">WELCOME BACK</div>
              <h2>Sign in</h2>
              <p>Access your Prompt2Insight workspace.</p>
            </div>
            <form className="login-form" onSubmit={submitLogin}>
              <label htmlFor="username">User name</label>
              <input
                autoComplete="username"
                id="username"
                onChange={(event) => setUsername(event.target.value)}
                required
                value={username}
              />
              <label htmlFor="password">Password</label>
              <input
                autoComplete="current-password"
                id="password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
              {loginError && <p className="form-error" role="alert">{loginError}</p>}
              <button className="submit-button login-submit" disabled={isLoggingIn} type="submit">
                {isLoggingIn ? "Signing in..." : "Continue to workspace"}
              </button>
            </form>
            <p className="login-support">Need access? Contact your workspace administrator.</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Prompt2Insight home">
          <span className="brand-mark"><SparkleIcon /></span>
          <span>Prompt<span className="brand-light">2</span>Insight</span>
        </a>
        <div className="sidebar-label">WORKSPACE</div>
        <button className="nav-item active" type="button">
          <span className="nav-icon">✳</span>
          New prompt
        </button>
        <div className="sidebar-note">
          <div className="note-icon"><SparkleIcon /></div>
          <strong>From question to insight.</strong>
          <p>Explore trusted business data with answers grounded in query results.</p>
        </div>
        <div className="sidebar-footer">
          <span className="status-dot" />
          Agent + PostgreSQL
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> New prompt</div>
          <div className="account-controls">
            <span>Signed in as <strong>{signedInUser.name}</strong></span>
            <button onClick={() => void logout()} type="button">Sign out</button>
          </div>
          <div className="preview-badge"><span /> Ollama · PostgreSQL</div>
        </header>

        <section className="workspace">
          <div className="intro">
            <div className="eyebrow">PROMPT2INSIGHT WORKSPACE</div>
            <h1>Insights from<br className="desktop-break" /> your data.</h1>
            <p>Ask a question. Get a clear answer.</p>
          </div>

          <form className="prompt-card" onSubmit={submitPrompt} aria-busy={isSubmitting}>
            <label htmlFor="prompt">Your prompt</label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(event) => {
                setPrompt(event.target.value);
                if (error) setError("");
              }}
              onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Ask a question, describe what you need, or paste your instructions..."
              rows={5}
              disabled={isSubmitting}
            />
            <div className="prompt-toolbar">
              <span className="input-hint">Answers are grounded in your data. Queries run read-only.</span>
              <button className="submit-button" type="submit" disabled={isSubmitting}>
                <SparkleIcon />
                <span>{isSubmitting ? "Searching..." : "Ask the agent"}</span>
                {!isSubmitting && <kbd>Ctrl ↵</kbd>}
              </button>
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
          </form>

          {!result ? (
            <section className="suggestions" aria-label="Prompt suggestions">
              <div className="section-kicker">BASED ON YOUR QUESTION HISTORY</div>
              {suggestionError ? (
                <p className="suggestion-status" role="status">{suggestionError}</p>
              ) : isLoadingSuggestions ? (
                <p className="suggestion-status" role="status">Finding relevant past questions…</p>
              ) : suggestions.length ? (
                <div className="suggestion-list">
                  {suggestions.map((suggestion) => (
                    <button
                      className="suggestion-chip"
                      key={suggestion}
                      onClick={() => useSuggestion(suggestion)}
                      type="button"
                    >
                      <span>↗</span>{suggestion}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="suggestion-status" role="status">
                  No matching past questions for this user yet.
                </p>
              )}
            </section>
          ) : (
            <section className="result-card" aria-live="polite">
              <div className="result-header">
                <div className="result-title">
                  <span className="result-icon"><SparkleIcon /></span>
                  <div>
                    <h2>Results</h2>
                    <p>Agent response · saved to PostgreSQL</p>
                  </div>
                </div>
                <span className="demo-tag">DATABASE ANSWER</span>
              </div>
              <div className="submitted-prompt">
                <span className="section-kicker">PROMPT</span>
                <p>{result.prompt}</p>
              </div>
              <details className="workflow-details" open>
                <summary>How the agents worked</summary>
                <p className="workflow-intro">
                  LangGraph passed the request and result between Google ADK
                  agents. These are their task outcomes, not hidden reasoning.
                </p>
                <ol className="workflow-stages">
                  <li>
                    <div className="workflow-stage-heading">
                      <strong>1. Data Query Agent</strong>
                      <span>{result.workflowTrace.dataQuery.status === "completed" ? "Query executed" : "No query executed"}</span>
                    </div>
                    <p>Looked for a safe database query to answer the prompt. The server validated and ran any SQL read-only.</p>
                    <p className="workflow-agent-output">{result.workflowTrace.dataQuery.response}</p>
                    {result.workflowTrace.dataQuery.sql && (
                      <div className="workflow-meta">
                        Returned {result.workflowTrace.dataQuery.rowCount} rows
                        {result.workflowTrace.dataQuery.truncated ? " (truncated)" : ""}
                        {result.workflowTrace.dataQuery.columns.length > 0 &&
                          <> · Columns: {result.workflowTrace.dataQuery.columns.join(", ")}</>}
                      </div>
                    )}
                  </li>
                  <li>
                    <div className="workflow-stage-heading">
                      <strong>2. Business Analysis Agent</strong>
                      <span>{result.workflowTrace.businessAnalysis.status === "completed" ? "Completed" : "Skipped"}</span>
                    </div>
                    <p>Interpreted the structured rows returned by the database, without querying it independently.</p>
                    <p className="workflow-agent-output">{result.workflowTrace.businessAnalysis.response}</p>
                  </li>
                  <li>
                    <div className="workflow-stage-heading">
                      <strong>3. Report Agent</strong>
                      <span>{result.workflowTrace.report.status === "completed" ? "Completed" : "Skipped"}</span>
                    </div>
                    <p>Formatted the result as a concise response, key points, and an optional chart specification.</p>
                    <p className="workflow-agent-output">{result.workflowTrace.report.summary}</p>
                    {result.workflowTrace.report.keyPoints.length > 0 && (
                      <ul>
                        {result.workflowTrace.report.keyPoints.map((point, index) => (
                          <li key={index}>{point}</li>
                        ))}
                      </ul>
                    )}
                    <div className="workflow-meta">
                      {result.workflowTrace.report.chartCreated
                        ? "Chart specification created and validated against query columns."
                        : "No chart was created for this result."}
                    </div>
                  </li>
                </ol>
              </details>
              <div className="result-body">
                <div className="section-kicker">RESPONSE</div>
                <p>{result.answer}</p>
                {result.report.keyPoints.length > 0 && (
                  <ul className="report-key-points">
                    {result.report.keyPoints.map((point, index) => (
                      <li key={index}>{point}</li>
                    ))}
                  </ul>
                )}
              </div>
              {result.report.chart && result.report.chart.points.length > 0 && (
                <section className="report-chart" aria-label={result.report.chart.title}>
                  <div className="section-kicker">{result.report.chart.title}</div>
                  <div className="report-chart-bars">
                    {result.report.chart.points.map((point, index) => {
                      const maximum = Math.max(
                        ...result.report.chart!.points.map(({ value }) => Math.abs(value)),
                        1,
                      );
                      return (
                        <div className="report-chart-row" key={`${point.label}-${index}`}>
                          <span title={point.label}>{point.label}</span>
                          <div className="report-chart-track">
                            <div
                              className="report-chart-bar"
                              style={{ width: `${Math.max(2, (Math.abs(point.value) / maximum) * 100)}%` }}
                            />
                          </div>
                          <strong>{point.value.toLocaleString()}</strong>
                        </div>
                      );
                    })}
                  </div>
                  <p>{result.report.chart.xKey} · {result.report.chart.yKey}</p>
                </section>
              )}
              {result.query && (
                <div className="query-details">
                  <div className="section-kicker">SQL QUERY</div>
                  <pre><code>{result.query.sql}</code></pre>
                  <div className="section-kicker query-count">
                    {result.query.rowCount} {result.query.rowCount === 1 ? "ROW" : "ROWS"} RETURNED
                  </div>
                  {result.query.rows.length > 0 && (
                    <div className="query-table-scroll">
                      <table>
                        <thead>
                          <tr>
                            {Object.keys(result.query.rows[0]).map((column) => (
                              <th key={column}>{column}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.query.rows.map((row, rowIndex) => (
                            <tr key={rowIndex}>
                              {Object.values(row).map((value, columnIndex) => (
                                <td key={columnIndex}>
                                  {value === null ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {result.query.truncated && (
                    <p className="query-limit-note">
                      Showing the first {result.query.rowCount} rows. Increase maxRows in config/agent.json to return more.
                    </p>
                  )}
                </div>
              )}
              <button className="edit-prompt" onClick={() => document.getElementById("prompt")?.focus()} type="button">
                Edit prompt <span>↗</span>
              </button>
              <div className="feedback-row" aria-busy={feedback === "saving"}>
                <span>Was this response helpful?</span>
                <div className="feedback-actions">
                  <button
                    aria-label="This response was helpful"
                    aria-pressed={feedback === "positive"}
                    className={`feedback-button${feedback === "positive" ? " selected" : ""}`}
                    disabled={feedback === "saving"}
                    onClick={() => void submitFeedback(true)}
                    type="button"
                  >
                    <FeedbackIcon positive />
                  </button>
                  <button
                    aria-label="This response was not helpful"
                    aria-pressed={feedback === "negative"}
                    className={`feedback-button${feedback === "negative" ? " selected" : ""}`}
                    disabled={feedback === "saving"}
                    onClick={() => void submitFeedback(false)}
                    type="button"
                  >
                    <FeedbackIcon positive={false} />
                  </button>
                </div>
              </div>
              {feedbackError && <p className="feedback-error" role="alert">{feedbackError}</p>}
              {feedback === "saving" && (
                <p className="feedback-confirmation" role="status">Saving feedback...</p>
              )}
              {(feedback === "positive" || feedback === "negative") && (
                <p className="feedback-confirmation" role="status">
                  {feedback === "positive"
                    ? "Thanks for your feedback!"
                    : "Thanks — your feedback was saved."}
                </p>
              )}
            </section>
          )}

          <p className="privacy-note">
            <span>ⓘ</span> Generated database queries run read-only. Query history and feedback are saved to PostgreSQL.
          </p>
        </section>
      </main>
    </div>
  );
}

export default App;
