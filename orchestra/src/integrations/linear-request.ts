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
    throw new Error(
      `Linear API error: HTTP ${response.status} ${response.statusText}. ` +
        "Check LINEAR_API_KEY/LINEAR_TEAM_ID and network access.",
    );
  }

  let payload: LinearGraphQLResponse<T>;
  try {
    payload = JSON.parse(text) as LinearGraphQLResponse<T>;
  } catch {
    throw new Error("Linear API error: Invalid JSON response. Check Linear API availability.");
  }

  if (payload.errors && payload.errors.length > 0) {
    throw new Error(
      `Linear API error: ${payload.errors.map((e) => e.message).join("; ")}. ` +
        "Check the query, team id, and permissions.",
    );
  }
  if (!payload.data) {
    throw new Error("Linear API error: Missing response data. Try again or check API status.");
  }
  return payload.data;
};
