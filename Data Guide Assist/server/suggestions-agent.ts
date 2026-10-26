import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod";

const MAX_SUGGESTIONS = 3;
const SuggestionState = new StateSchema({
  prompt: z.string(),
  history: z.array(z.string()),
  relevantPrompts: z.array(z.string()).default([]),
  suggestions: z.array(z.string()).default([]),
});

function tokenize(value: string): string[] {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function findRelevantPrompts(prompt: string, history: string[]): string[] {
  const query = prompt.trim().toLocaleLowerCase();
  if (!query) {
    return history;
  }

  const queryTokens = tokenize(query);
  return history
    .map((text, index) => {
      const normalizedText = text.toLocaleLowerCase();
      const matchingTokens = queryTokens.filter((token) =>
        tokenize(text).includes(token),
      ).length;
      const startsWithQuery = normalizedText.startsWith(query);
      return {
        text,
        index,
        score:
          (startsWithQuery ? 100 : 0) +
          (normalizedText.includes(query) ? 50 : 0) +
          matchingTokens * 10,
      };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ text }) => text);
}

const suggestionsGraph = new StateGraph(SuggestionState)
  .addNode("match_user_history", ({ prompt, history }) => ({
    relevantPrompts: findRelevantPrompts(prompt, history),
  }))
  .addNode("select_suggestions", ({ relevantPrompts }) => ({
    suggestions: [...new Set(relevantPrompts)].slice(0, MAX_SUGGESTIONS),
  }))
  .addEdge(START, "match_user_history")
  .addEdge("match_user_history", "select_suggestions")
  .addEdge("select_suggestions", END)
  .compile();

export async function suggestPrompts(
  prompt: string,
  history: string[],
): Promise<string[]> {
  const result = await suggestionsGraph.invoke({ prompt, history });
  return result.suggestions;
}
