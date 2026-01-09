import { describe, expect, test, vi } from "vitest";
import {
  createOrchestratorBridgeClient,
  type OrchestratorStatus,
  type OrchestratorOutput,
} from "../orchestrator-bridge";

describe("orchestrator-bridge client", () => {
  const baseUrl = "http://localhost:3000";

  // Helper to create a mock fetch
  const createMockFetch = (
    response: unknown,
    options?: { status?: number; ok?: boolean },
  ): typeof globalThis.fetch => {
    return vi.fn().mockResolvedValue({
      ok: options?.ok ?? true,
      status: options?.status ?? 200,
      json: () => Promise.resolve(response),
      text: () => Promise.resolve(JSON.stringify(response)),
    }) as unknown as typeof globalThis.fetch;
  };

  describe("fetchStatus", () => {
    test("fetches from /v1/status endpoint", async () => {
      const mockResponse: OrchestratorStatus = {
        workers: [
          {
            id: "test-worker",
            name: "Test Worker",
            status: "ready",
            model: "test-model",
          },
        ],
        jobs: {
          total: 5,
          running: 1,
          succeeded: 3,
          failed: 0,
          canceled: 1,
        },
      };

      const mockFetch = createMockFetch(mockResponse);
      const client = createOrchestratorBridgeClient({
        baseUrl,
        fetch: mockFetch,
      });

      const result = await client.fetchStatus();

      expect(mockFetch).toHaveBeenCalledWith(`${baseUrl}/v1/status`);
      expect(result).toEqual(mockResponse);
    });

    test("returns null on network error", async () => {
      const mockFetch = vi
        .fn()
        .mockRejectedValue(new Error("Network error")) as unknown as typeof globalThis.fetch;
      const client = createOrchestratorBridgeClient({
        baseUrl,
        fetch: mockFetch,
      });

      const result = await client.fetchStatus();

      expect(result).toBeNull();
    });

    test("returns null on non-ok response", async () => {
      const mockFetch = createMockFetch(null, { ok: false, status: 500 });
      const client = createOrchestratorBridgeClient({
        baseUrl,
        fetch: mockFetch,
      });

      const result = await client.fetchStatus();

      expect(result).toBeNull();
    });

    test("returns null on invalid JSON", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError("Invalid JSON")),
      }) as unknown as typeof globalThis.fetch;
      const client = createOrchestratorBridgeClient({
        baseUrl,
        fetch: mockFetch,
      });

      const result = await client.fetchStatus();

      expect(result).toBeNull();
    });
  });

  describe("fetchOutput", () => {
    test("fetches from /v1/output endpoint", async () => {
      const mockResponse: OrchestratorOutput = {
        jobs: [
          {
            id: "job-1",
            workerId: "test-worker",
            message: "Test task",
            status: "succeeded",
            startedAt: 1730000000000,
            finishedAt: 1730000005000,
            durationMs: 5000,
          },
        ],
        logs: [
          {
            at: 1730000000000,
            level: "info",
            message: "Test log",
          },
        ],
      };

      const mockFetch = createMockFetch(mockResponse);
      const client = createOrchestratorBridgeClient({
        baseUrl,
        fetch: mockFetch,
      });

      const result = await client.fetchOutput();

      expect(mockFetch).toHaveBeenCalledWith(`${baseUrl}/v1/output`);
      expect(result).toEqual(mockResponse);
    });

    test("respects limit param", async () => {
      const mockFetch = createMockFetch({ jobs: [], logs: [] });
      const client = createOrchestratorBridgeClient({
        baseUrl,
        fetch: mockFetch,
      });

      await client.fetchOutput({ limit: 10 });

      expect(mockFetch).toHaveBeenCalledWith(`${baseUrl}/v1/output?limit=10`);
    });

    test("respects after param", async () => {
      const mockFetch = createMockFetch({ jobs: [], logs: [] });
      const client = createOrchestratorBridgeClient({
        baseUrl,
        fetch: mockFetch,
      });

      await client.fetchOutput({ after: 1730000000000 });

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/v1/output?after=1730000000000`,
      );
    });

    test("includes both limit and after params", async () => {
      const mockFetch = createMockFetch({ jobs: [], logs: [] });
      const client = createOrchestratorBridgeClient({
        baseUrl,
        fetch: mockFetch,
      });

      await client.fetchOutput({ limit: 5, after: 1730000000000 });

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/v1/output?limit=5&after=1730000000000`,
      );
    });

    test("returns null on network error", async () => {
      const mockFetch = vi
        .fn()
        .mockRejectedValue(new Error("Network error")) as unknown as typeof globalThis.fetch;
      const client = createOrchestratorBridgeClient({
        baseUrl,
        fetch: mockFetch,
      });

      const result = await client.fetchOutput();

      expect(result).toBeNull();
    });

    test("returns null on non-ok response", async () => {
      const mockFetch = createMockFetch(null, { ok: false, status: 500 });
      const client = createOrchestratorBridgeClient({
        baseUrl,
        fetch: mockFetch,
      });

      const result = await client.fetchOutput();

      expect(result).toBeNull();
    });
  });

  describe("getEventsUrl", () => {
    test("returns the events URL", () => {
      const client = createOrchestratorBridgeClient({ baseUrl });

      expect(client.getEventsUrl()).toBe(`${baseUrl}/v1/events`);
    });
  });

  describe("baseUrl handling", () => {
    test("strips trailing slash from baseUrl", async () => {
      const mockFetch = createMockFetch({ workers: [], jobs: {} });
      const client = createOrchestratorBridgeClient({
        baseUrl: "http://localhost:3000/",
        fetch: mockFetch,
      });

      await client.fetchStatus();

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3000/v1/status",
      );
    });

    test("handles undefined baseUrl gracefully", async () => {
      const mockFetch = createMockFetch({ workers: [], jobs: {} });
      const client = createOrchestratorBridgeClient({
        baseUrl: undefined,
        fetch: mockFetch,
      });

      const result = await client.fetchStatus();

      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});

describe("resolveOrchestratorBaseUrl", () => {
  test("extracts base URL from events URL", async () => {
    const { resolveOrchestratorBaseUrl } = await import(
      "../orchestrator-bridge"
    );

    expect(resolveOrchestratorBaseUrl("http://localhost:3000/v1/events")).toBe(
      "http://localhost:3000",
    );
    expect(
      resolveOrchestratorBaseUrl("http://localhost:3000/v1/events/"),
    ).toBe("http://localhost:3000");
    expect(resolveOrchestratorBaseUrl("http://localhost:3000")).toBe(
      "http://localhost:3000",
    );
  });

  test("returns undefined for empty input", async () => {
    const { resolveOrchestratorBaseUrl } = await import(
      "../orchestrator-bridge"
    );

    expect(resolveOrchestratorBaseUrl(undefined)).toBeUndefined();
    expect(resolveOrchestratorBaseUrl("")).toBeUndefined();
  });
});
