import { useState, type FormEvent, type KeyboardEvent } from "react";

interface SavedPrompt {
  id: string;
  savedAt: string;
}

interface PromptResult extends SavedPrompt {
  prompt: string;
  answer: string;
  query: {
    sql: string;
    rows: Record<string, unknown>[];
    rowCount: number;
    truncated: boolean;
  } | null;
}

type FeedbackState = "saving" | "positive" | "negative" | null;
interface PromptResponse extends SavedPrompt {
  answer: string;
  query: PromptResult["query"];
}

const suggestions: string[] = [
  "How many orders are there?",
  "List the 10 most expensive products",
  "Show overdue invoices",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function parsePromptResponse(value: unknown): PromptResponse {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.savedAt !== "string" ||
    typeof value.answer !== "string" ||
    !(value.query === null || isQueryResult(value.query))
  ) {
    throw new Error("The server returned an invalid prompt response.");
  }
  return {
    id: value.id,
    savedAt: value.savedAt,
    answer: value.answer,
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
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<PromptResult | null>(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [feedbackError, setFeedbackError] = useState("");

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
        body: JSON.stringify({ prompt: submittedPrompt }),
      });
      const payload = parsePromptResponse(await readApiResponse(response));

      setResult({
        id: payload.id,
        prompt: submittedPrompt,
        savedAt: payload.savedAt,
        answer: payload.answer,
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
    if (!result || feedback) return;
    setFeedbackError("");
    setFeedback("saving");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptId: result.id,
          rating: positive ? "Thumbs Up" : "Thumbs Down",
        }),
      });
      await readApiResponse(response);
      setFeedback(positive ? "positive" : "negative");
    } catch (requestError) {
      setFeedback(null);
      setFeedbackError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to save feedback. Check that the local server is running and try again.",
      );
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Data Guide Assist home">
          <span className="brand-mark"><SparkleIcon /></span>
          <span>Data Guide <span className="brand-light">Assist</span></span>
        </a>
        <div className="sidebar-label">WORKSPACE</div>
        <button className="nav-item active" type="button">
          <span className="nav-icon">✳</span>
          New prompt
        </button>
        <div className="sidebar-note">
          <div className="note-icon"><SparkleIcon /></div>
          <strong>Your ideas, in one place.</strong>
          <p>Write a prompt and your results will appear here.</p>
        </div>
        <div className="sidebar-footer">
          <span className="status-dot" />
          Agent + PostgreSQL
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> New prompt</div>
          <div className="preview-badge"><span /> Ollama · PostgreSQL</div>
        </header>

        <section className="workspace">
          <div className="intro">
            <div className="eyebrow">YOUR AI WORKSPACE</div>
            <h1>What would you like<br className="desktop-break" /> to explore?</h1>
            <p>Ask a question in plain English and the agent will search your database.</p>
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
              <span className="input-hint">Responses are saved to data/prompts.xlsx</span>
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
              <div className="section-kicker">NEED A STARTING POINT?</div>
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
            </section>
          ) : (
            <section className="result-card" aria-live="polite">
              <div className="result-header">
                <div className="result-title">
                  <span className="result-icon"><SparkleIcon /></span>
                  <div>
                    <h2>Results</h2>
                    <p>Agent response · saved to Excel</p>
                  </div>
                </div>
                <span className="demo-tag">DATABASE ANSWER</span>
              </div>
              <div className="submitted-prompt">
                <span className="section-kicker">PROMPT</span>
                <p>{result.prompt}</p>
              </div>
              <div className="result-body">
                <div className="section-kicker">RESPONSE</div>
                <p>{result.answer}</p>
              </div>
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
                    disabled={feedback !== null}
                    onClick={() => void submitFeedback(true)}
                    type="button"
                  >
                    <FeedbackIcon positive />
                  </button>
                  <button
                    aria-label="This response was not helpful"
                    aria-pressed={feedback === "negative"}
                    className={`feedback-button${feedback === "negative" ? " selected" : ""}`}
                    disabled={feedback !== null}
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
            <span>ⓘ</span> Database queries run read-only; successful prompts and feedback are saved locally in Excel.
          </p>
        </section>
      </main>
    </div>
  );
}

export default App;
