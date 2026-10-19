export const maxPromptLength = 10_000;
export const maxAnswerLength = 20_000;

export function validatePrompt(input: unknown): string {
  if (typeof input !== "string" || !input.trim()) {
    throw new Error("Enter a prompt before asking the agent.");
  }
  if (input.length > maxPromptLength) {
    throw new Error(
      `Prompts must be ${maxPromptLength.toLocaleString()} characters or fewer.`,
    );
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(input)) {
    throw new Error("Prompts cannot contain control characters.");
  }
  return input.trim();
}

export function validateAgentAnswer(answer: string): string {
  const trimmed = answer.trim();
  if (!trimmed) {
    throw new Error("The agent completed without returning a text response.");
  }
  if (trimmed.length > maxAnswerLength) {
    throw new Error("The agent response exceeded the maximum allowed length.");
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(trimmed)) {
    throw new Error("The agent response contained unsupported control characters.");
  }
  return trimmed;
}
