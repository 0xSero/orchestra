import { afterEach, describe, expect, test } from "bun:test";
import { linearRequest } from "../../src/integrations/linear-request";
import type { LinearConfig } from "../../src/integrations/linear-types";

const cfg: LinearConfig = {
  apiUrl: "https://linear.test/graphql",
  apiKey: "linear-test-key",
  teamId: "team-1",
};

const withFetchStub = (handler: (input: Parameters<typeof fetch>[0], init?: RequestInit) => Promise<Response>) => {
  const original = globalThis.fetch;
  const stubbedFetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) =>
    handler(input, init)) as typeof fetch;
  stubbedFetch.preconnect = (...args: Parameters<typeof fetch.preconnect>) => {
    if (typeof original.preconnect === "function") {
      original.preconnect(...args);
    }
  };
  globalThis.fetch = stubbedFetch;
  return () => {
    globalThis.fetch = original;
  };
};

describe("linearRequest", () => {
  let restoreFetch: (() => void) | undefined;

  afterEach(() => {
    restoreFetch?.();
    restoreFetch = undefined;
  });

  test("returns data when response is ok", async () => {
    restoreFetch = withFetchStub(async () => {
      return new Response(JSON.stringify({ data: { viewer: { id: "viewer-1" } } }), { status: 200 });
    });

    const result = await linearRequest<{ viewer: { id: string } }>(cfg, "query Viewer { viewer { id } }");
    expect(result.viewer.id).toBe("viewer-1");
  });

  test("throws on non-200 response", async () => {
    restoreFetch = withFetchStub(async () => {
      return new Response("bad request", { status: 400, statusText: "Bad Request" });
    });

    await expect(linearRequest(cfg, "query Viewer { viewer { id } }")).rejects.toThrow(
      "Linear API error: HTTP 400 Bad Request",
    );
  });

  test("throws on invalid JSON payload", async () => {
    restoreFetch = withFetchStub(async () => new Response("not-json", { status: 200 }));

    await expect(linearRequest(cfg, "query Viewer { viewer { id } }")).rejects.toThrow(
      "Linear API error: Invalid JSON response.",
    );
  });

  test("throws on GraphQL errors", async () => {
    restoreFetch = withFetchStub(async () => {
      return new Response(JSON.stringify({ errors: [{ message: "boom" }] }), { status: 200 });
    });

    await expect(linearRequest(cfg, "query Viewer { viewer { id } }")).rejects.toThrow("Linear API error: boom");
  });

  test("throws when data is missing", async () => {
    restoreFetch = withFetchStub(async () => {
      return new Response(JSON.stringify({}), { status: 200 });
    });

    await expect(linearRequest(cfg, "query Viewer { viewer { id } }")).rejects.toThrow(
      "Linear API error: Missing response data.",
    );
  });
});
