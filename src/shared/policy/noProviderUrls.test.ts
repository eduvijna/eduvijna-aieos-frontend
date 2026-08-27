import { describe, expect, it } from "vitest";

const FORBIDDEN =
  /openai\.com|anthropic\.com|generativelanguage\.googleapis\.com|api\.anthropic|api\.openai|supabase\.co\/functions|supermemory|mcp:\/\//i;

/** Direct model, agent, memory, or database access from the browser. */
const FORBIDDEN_CLIENTS =
  /\bpostgres(ql)?:\/\/|\bpg:\/\/|from ["'](openai|@anthropic-ai\/[\w-]+|@google\/generative-ai|@modelcontextprotocol\/[\w-]+|supermemory|pg|postgres)["']|\/v1\/chat\/completions|\/v1\/messages\b|\/v1\/embeddings\b|@modelcontextprotocol/i;

/** The API base path is the only server contract the frontend may speak. */
const ALLOWED_API_PREFIX = "/api/v1/";

const sources = import.meta.glob(
  [
    "../../**/*.{ts,tsx,css,js,mjs}",
    "!../../**/*.{test,spec}.{ts,tsx}",
    "!../../services/api/generated/**",
  ],
  { eager: true, query: "?raw", import: "default" },
) as Record<string, string>;

const appSources = Object.fromEntries(
  Object.entries(sources).filter(([file]) => !file.includes("/test/")),
);

function offendersFor(pattern: RegExp): string[] {
  return Object.entries(appSources)
    .filter(([, text]) => pattern.test(text))
    .map(([file]) => file);
}

describe("I. Frontend speaks only to the AIEOS HTTP contract", () => {
  it("does not reference OpenAI/Anthropic/Gemini/MCP/Supermemory endpoints", () => {
    expect(offendersFor(FORBIDDEN)).toEqual([]);
  });

  it("does not import model, agent, memory, or PostgreSQL clients", () => {
    expect(offendersFor(FORBIDDEN_CLIENTS)).toEqual([]);
  });

  it("requests only /api/v1 paths", () => {
    const offenders: string[] = [];
    for (const [file, text] of Object.entries(appSources)) {
      for (const match of text.matchAll(/apiRequest<[^>]*>\(\s*(["'`])/g)) {
        const start = (match.index ?? 0) + match[0].length;
        if (!text.slice(start).startsWith(ALLOWED_API_PREFIX)) {
          offenders.push(file);
        }
      }
      for (const match of text.matchAll(/\bfetch\(\s*(["'`])([^"'`]*)/g)) {
        if (!match[2].startsWith(ALLOWED_API_PREFIX)) {
          offenders.push(file);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps no Teaching Work or session authority in browser storage", () => {
    const offenders = offendersFor(
      /\b(localStorage|sessionStorage|indexedDB)\s*[.[]|document\.cookie\s*=/,
    );
    expect(offenders).toEqual([]);
  });
});
