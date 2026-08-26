import { describe, expect, it } from "vitest";

const FORBIDDEN =
  /openai\.com|anthropic\.com|generativelanguage\.googleapis\.com|api\.anthropic|api\.openai|supabase\.co\/functions|supermemory|mcp:\/\//i;

const sources = import.meta.glob(
  [
    "../../**/*.{ts,tsx,css,js,mjs}",
    "!../../**/*.{test,spec}.{ts,tsx}",
    "!../../services/api/generated/**",
  ],
  { eager: true, query: "?raw", import: "default" },
) as Record<string, string>;

describe("I. No LLM/MCP provider URLs in src", () => {
  it("does not reference OpenAI/Anthropic/Gemini/MCP/Supermemory endpoints", () => {
    const offenders: string[] = [];
    for (const [file, text] of Object.entries(sources)) {
      if (FORBIDDEN.test(text)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
