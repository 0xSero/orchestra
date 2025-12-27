import type { LinearConfig } from "./linear-types";

type LinearGraphQLError = {
  message: string;
};

type LinearGraphQLResponse<T> = {
  data?: T;
  errors?: LinearGraphQLError[];
};

export const linearRequest = async <T>(
  cfg: LinearConfig,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> => {
  const response = await fetch(cfg.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: cfg.apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Linear API error: HTTP ${response.status} ${response.statusText}`);
  }

  let payload: LinearGraphQLResponse<T>;
  try {
    payload = JSON.parse(text) as LinearGraphQLResponse<T>;
  } catch {
    throw new Error("Linear API error: Invalid JSON response.");
  }

  if (payload.errors && payload.errors.length > 0) {
    throw new Error(`Linear API error: ${payload.errors.map((e) => e.message).join("; ")}`);
  }
  if (!payload.data) {
    throw new Error("Linear API error: Missing response data.");
  }
  return payload.data;
};
