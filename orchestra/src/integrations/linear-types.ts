export type LinearConfig = {
  apiKey: string;
  teamId: string;
  apiUrl: string;
  projectPrefix?: string;
};

export type LinearIssue = {
  id: string;
  title?: string;
  url?: string;
  identifier?: string;
};

export type LinearProject = {
  id: string;
  name?: string;
  state?: string;
  url?: string;
  progress?: number | null;
  issueCount?: number | null;
  completedIssueCount?: number | null;
};

export type LinearProjectStatus = {
  project: LinearProject;
};

export type LinearTeamState = {
  id: string;
  name?: string;
  type?: string;
};
