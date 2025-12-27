import { linearRequest } from "./linear-request";
import type { LinearConfig, LinearTeamState } from "./linear-types";

/** Fetch workflow states for a Linear team. */
export const getTeamStates = async (input: { cfg: LinearConfig; teamId?: string }): Promise<LinearTeamState[]> => {
  const data = await linearRequest<{
    team: { states: { nodes: LinearTeamState[] } };
  }>(
    input.cfg,
    `query TeamStates($id: ID!) {
      team(id: $id) {
        states {
          nodes { id name type }
        }
      }
    }`,
    { id: input.teamId ?? input.cfg.teamId },
  );

  return data.team?.states?.nodes ?? [];
};

/** Normalize a status string to a slug-friendly format. */
export const normalizeStatus = (status: string): string => status.trim().toLowerCase().replace(/\s+/g, "_");
