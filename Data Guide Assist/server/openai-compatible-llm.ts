import OpenAI from "openai";
import {
  BaseLlm,
  type BaseLlmConnection,
  type LlmRequest,
  type LlmResponse,
} from "@google/adk";
import type { Content, FunctionDeclaration, Part } from "@google/genai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";

export interface OpenAICompatibleLlmConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textFromParts(parts: Part[] | undefined): string {
  return (parts ?? [])
    .map((part) => part.text ?? "")
    .filter(Boolean)
    .join("\n");
}

function getSystemInstruction(request: LlmRequest): string | undefined {
  const instruction = request.config?.systemInstruction;
  if (typeof instruction === "string") {
    return instruction;
  }
  if (isRecord(instruction)) {
    if (typeof instruction.text === "string") {
      return instruction.text;
    }
    if (Array.isArray(instruction.parts)) {
      return textFromParts(instruction.parts as Part[]);
    }
  }
  return undefined;
}

export function toOpenAIMessages(request: LlmRequest): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [];
  const systemInstruction = getSystemInstruction(request);
  if (systemInstruction) {
    messages.push({ role: "system", content: systemInstruction });
  }

  for (const content of request.contents) {
    const functionResponses = (content.parts ?? []).filter((part) => part.functionResponse);
    if (functionResponses.length > 0) {
      for (const part of functionResponses) {
        const response = part.functionResponse;
        if (!response?.id) {
          throw new Error("The agent returned a database tool result without a function-call ID.");
        }
        messages.push({
          role: "tool",
          tool_call_id: response.id,
          content: JSON.stringify(response.response ?? {}),
        });
      }
      continue;
    }

    const text = textFromParts(content.parts);
    if (content.role === "model") {
      const toolCalls = (content.parts ?? [])
        .filter((part) => part.functionCall?.name)
        .map((part) => {
          const call = part.functionCall;
          return {
            id: call?.id ?? "",
            type: "function" as const,
            function: {
              name: call?.name ?? "",
              arguments: JSON.stringify(call?.args ?? {}),
            },
          };
        });
      messages.push({
        role: "assistant",
        content: text || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
    } else if (text) {
      messages.push({ role: "user", content: text });
    }
  }
  return messages;
}

export function toOpenAITools(request: LlmRequest): ChatCompletionTool[] | undefined {
  const declarations: FunctionDeclaration[] = [];
  for (const tool of request.config?.tools ?? []) {
    if ("functionDeclarations" in tool && Array.isArray(tool.functionDeclarations)) {
      declarations.push(...tool.functionDeclarations);
    }
  }
  if (declarations.length === 0) {
    return undefined;
  }

  return declarations.flatMap((declaration: FunctionDeclaration) => {
    if (!declaration.name) {
      return [];
    }
    const parameters =
      declaration.parametersJsonSchema ??
      declaration.parameters ?? {
        type: "object",
        properties: {},
      };
    if (!isRecord(parameters)) {
      throw new Error(`The schema for agent tool "${declaration.name}" is invalid.`);
    }
    return [{
      type: "function" as const,
      function: {
        name: declaration.name,
        description: declaration.description ?? "",
        parameters,
      },
    }];
  });
}

function toADKContent(
  message: OpenAI.Chat.Completions.ChatCompletionMessage,
): Content {
  const parts: Part[] = [];
  if (message.content) {
    parts.push({ text: message.content });
  }
  for (const call of message.tool_calls ?? []) {
    if (call.type !== "function") {
      continue;
    }
    let args: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(call.function.arguments);
      if (!isRecord(parsed)) {
        throw new Error("Tool arguments must be a JSON object.");
      }
      args = parsed;
    } catch (error) {
      throw new Error(`Ollama returned invalid arguments for "${call.function.name}".`, {
        cause: error,
      });
    }
    parts.push({
      functionCall: {
        id: call.id,
        name: call.function.name,
        args,
      },
    });
  }
  return { role: "model", parts };
}

export class OpenAICompatibleLlm extends BaseLlm {
  static override readonly supportedModels: Array<string | RegExp> = [/.*/];

  private readonly client: OpenAI;

  constructor(config: OpenAICompatibleLlmConfig) {
    super({ model: config.model });
    const endpoint = new URL(config.baseURL);
    if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
      throw new Error("The OpenAI-compatible model URL must use HTTP or HTTPS.");
    }
    this.client = new OpenAI({
      baseURL: endpoint.toString(),
      apiKey: config.apiKey,
      maxRetries: 1,
      timeout: 120_000,
    });
  }

  override async *generateContentAsync(
    request: LlmRequest,
    _stream?: boolean,
    abortSignal?: AbortSignal,
  ): AsyncGenerator<LlmResponse, void> {
    const response = await this.client.chat.completions.create(
      {
        model: this.model,
        messages: toOpenAIMessages(request),
        tools: toOpenAITools(request),
      },
      { signal: abortSignal },
    );
    const choice = response.choices[0];
    if (!choice) {
      throw new Error("The OpenAI-compatible endpoint returned no model choices.");
    }
    yield {
      content: toADKContent(choice.message),
      turnComplete: true,
    };
  }

  override async connect(_request: LlmRequest): Promise<BaseLlmConnection> {
    throw new Error("Live model sessions are not supported by this OpenAI-compatible connector.");
  }
}
