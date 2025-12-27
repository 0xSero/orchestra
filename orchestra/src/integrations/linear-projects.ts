import { linearRequest } from "./linear-request";
import type { LinearConfig, LinearProject, LinearProjectStatus } from "./linear-types";

const applyProjectPrefix = (cfg: LinearConfig, name: string): string => {
  const prefix = cfg.projectPrefix;
  if (!prefix) return name;
  const normalized = `${prefix}-`;
  if (name.startsWith(normalized)) return name;
  return `${normalized}${name}`;
};

/** Fetch the current Linear viewer identity. */
export const getViewer = async (cfg: LinearConfig): Promise<{ id: string; name?: string; email?: string }> => {
  const data = await linearRequest<{ viewer: { id: string; name?: string; email?: string } }>(
    cfg,
    "query Viewer { viewer { id name email } }",
  );
  return data.viewer;
};

/** Create a new Linear project. */
export const createProject = async (input: {
  cfg: LinearConfig;
  name: string;
  description?: string;
  teamId?: string;
}): Promise<{ projectId: string; name?: string; url?: string }> => {
  const name = applyProjectPrefix(input.cfg, input.name);
  const data = await linearRequest<{
    projectCreate: { success: boolean; project?: LinearProject };
  }>(
    input.cfg,
    `mutation CreateProject($input: ProjectCreateInput!) {
      projectCreate(input: $input) {
        success
        project { id name url }
      }
    }`,
    {
      input: {
        name,
        description: input.description,
        teamId: input.teamId ?? input.cfg.teamId,
      },
    },
  );

  const project = data.projectCreate.project;
  if (!project?.id) throw new Error("Linear API error: Project not created.");
  return { projectId: project.id, name: project.name, url: project.url ?? undefined };
};

/** Fetch status fields for a Linear project. */
export const getProjectStatus = async (input: {
  cfg: LinearConfig;
  projectId: string;
}): Promise<LinearProjectStatus> => {
  const data = await linearRequest<{ project: LinearProject }>(
    input.cfg,
    `query ProjectStatus($id: ID!) {
      project(id: $id) {
        id
        name
        state
        url
        progress
        issueCount
        completedIssueCount
      }
    }`,
    { id: input.projectId },
  );

  if (!data.project?.id) throw new Error("Linear API error: Project not found.");
  return { project: data.project };
};
