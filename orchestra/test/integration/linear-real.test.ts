import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { getTeamStates, getViewer, loadLinearConfigFromEnv, resolveLinearConfig } from "../../src/integrations/linear";

describe("linear real integration", () => {
  const cfg = loadLinearConfigFromEnv();

  if (!cfg) {
    test("returns undefined when credentials are missing", () => {
      expect(loadLinearConfigFromEnv()).toBeUndefined();
    });

    test("resolveLinearConfig throws when missing credentials", () => {
      expect(() => resolveLinearConfig()).toThrow("Missing Linear credentials");
    });
    return;
  }

  const runReal = process.env.LINEAR_REAL_MODE === "1";
  let restoreFetch: (() => void) | undefined;

  const stubFetch = () => {
    const originalFetch = globalThis.fetch;
    const stubbedFetch = (async (_url, init) => {
      const bodyText = typeof init?.body === "string" ? init.body : "";
      const query = bodyText ? ((JSON.parse(bodyText) as { query?: string }).query ?? "") : "";
      if (query.includes("viewer")) {
        return new Response(JSON.stringify({ data: { viewer: { id: "viewer-1", name: "Test" } } }), { status: 200 });
      }
      if (query.includes("TeamStates")) {
        return new Response(
          JSON.stringify({
            data: { team: { states: { nodes: [{ id: "state-1", name: "Todo", type: "unstarted" }] } } },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    }) as typeof fetch;
    stubbedFetch.preconnect = (...args: Parameters<typeof fetch.preconnect>) => {
      if (typeof originalFetch.preconnect === "function") {
        originalFetch.preconnect(...args);
      }
    };
    globalThis.fetch = stubbedFetch;
    return () => {
      globalThis.fetch = originalFetch;
    };
  };

  beforeEach(() => {
    if (!runReal) {
      restoreFetch = stubFetch();
    }
  });

  afterEach(() => {
    restoreFetch?.();
    restoreFetch = undefined;
  });

  test("connects and returns viewer", async () => {
    const viewer = await getViewer(cfg);
    expect(viewer.id).toBeTruthy();
  });

  test("loads team states", async () => {
    const states = await getTeamStates({ cfg });
    expect(states.length).toBeGreaterThan(0);
  });
});
