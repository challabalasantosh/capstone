import { useState, type FormEvent, type KeyboardEvent } from "react";

interface SavedPrompt {
  id: string;
  savedAt: string;
}

interface PromptResult extends SavedPrompt {
  prompt: string;
  lines: string[];
}

type FeedbackState = "saving" | "positive" | "negative" | null;

const suggestions: string[] = [
  "Summarize a dataset",
  "Explain a SQL query",
  "Find trends in my data",
];

function makePreview(prompt: string): string[] {
  const cleanedPrompt = prompt.trim().replace(/\s+/g, " ");
  return [
    `I’ve received your request: “${cleanedPrompt}”`,
    "This is a local preview, so it doesn’t analyze data or call an AI model yet.",
    "Connect your model endpoint to turn this prompt into a live response.",
  ];
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
  const [isSaving, setIsSaving] = useState(false);
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
    setIsSaving(true);
    try {
      const response = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: submittedPrompt }),
      });
      const payload: SavedPrompt & { error?: string } = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "The prompt could not be saved.");
      }

      setResult({
        id: payload.id,
        prompt: submittedPrompt,
        lines: makePreview(submittedPrompt),
        savedAt: payload.savedAt,
      });
      setFeedback(null);
      setFeedbackError("");
    } catch (saveError) {
      setResult(null);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save your prompt. Check that the local server is running and try again.",
      );
    } finally {
      setIsSaving(false);
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
      const payload: { error?: string } = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Your feedback could not be saved.");
      }
      setFeedback(positive ? "positive" : "negative");
    } catch (saveError) {
      setFeedback(null);
      setFeedbackError(
        saveError instanceof Error
          ? saveError.message
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
          Preview mode
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> New prompt</div>
          <div className="preview-badge"><span /> Excel workbook</div>
        </header>

        <section className="workspace">
          <div className="intro">
            <div className="eyebrow">YOUR AI WORKSPACE</div>
            <h1>What would you like<br className="desktop-break" /> to explore?</h1>
            <p>Start with a prompt. Your response will show up right here.</p>
          </div>

          <form className="prompt-card" onSubmit={submitPrompt} aria-busy={isSaving}>
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
              disabled={isSaving}
            />
            <div className="prompt-toolbar">
              <span className="input-hint">Saved to data/prompts.xlsx</span>
              <button className="submit-button" type="submit" disabled={isSaving}>
                <SparkleIcon />
                <span>{isSaving ? "Saving..." : "Save prompt"}</span>
                {!isSaving && <kbd>Ctrl ↵</kbd>}
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
                    <p>Saved to data/prompts.xlsx</p>
                  </div>
                </div>
                <span className="demo-tag">SAVED TO EXCEL</span>
              </div>
              <div className="submitted-prompt">
                <span className="section-kicker">PROMPT</span>
                <p>{result.prompt}</p>
              </div>
              <div className="result-body">
                <div className="section-kicker">RESPONSE</div>
                {result.lines.map((line, index) => (
                  <p className={index === 2 ? "integration-hint" : ""} key={line}>{line}</p>
                ))}
              </div>
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
            <span>ⓘ</span> Prompts are stored locally in Excel. Responses are previews until an AI provider is connected.
          </p>
        </section>
      </main>
    </div>
  );
}

export default App;
