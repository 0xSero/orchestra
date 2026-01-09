// @jsxImportSource solid-js
import { render, screen, cleanup } from "@solidjs/testing-library";
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import type { Accessor } from "solid-js";
import type { JobRecord, JobSummary, WorkerRuntime } from "@/context/opencode-types";

// Create mocks - these need to be functions that return values
const mockJobs: Accessor<JobRecord[]> = () => [
  {
    id: "job-1",
    workerId: "coder",
    message: "Implement feature X",
    status: "succeeded",
    startedAt: Date.now() - 10000,
    finishedAt: Date.now() - 5000,
    durationMs: 5000,
    responsePreview: "Feature implemented successfully",
    responseLength: 256,
  },
  {
    id: "job-2",
    workerId: "vision",
    message: "Analyze image",
    status: "running",
    startedAt: Date.now() - 3000,
    progress: {
      message: "Processing...",
      percent: 50,
      updatedAt: Date.now(),
    },
  },
];

const mockJobSummary: Accessor<JobSummary | null> = () => ({
  total: 2,
  running: 1,
  succeeded: 1,
  failed: 0,
  canceled: 0,
});

const mockWorkers: Accessor<WorkerRuntime[]> = () => [
  { id: "coder", name: "Coder", status: "ready" },
  { id: "vision", name: "Vision", status: "busy" },
];

vi.mock("@/context/opencode", () => ({
  useOpenCode: () => ({
    jobs: mockJobs,
    jobSummary: mockJobSummary,
    workers: mockWorkers,
  }),
}));

// Import after mock
import { TasksPage } from "../tasks";

describe("TasksPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  test("renders without crashing", () => {
    const { container } = render(() => <TasksPage />);
    expect(container).toBeTruthy();
  });

  test("renders page header with title", () => {
    render(() => <TasksPage />);
    // Use getAllByRole since page title appears once
    const headings = screen.getAllByRole("heading", { name: "Tasks" });
    expect(headings.length).toBeGreaterThan(0);
  });

  test("renders summary stats labels", () => {
    render(() => <TasksPage />);
    const elements = screen.getAllByText("Total Jobs");
    expect(elements.length).toBeGreaterThan(0);
  });

  test("renders running tasks section", () => {
    render(() => <TasksPage />);
    const runningHeadings = screen.getAllByRole("heading", { name: "Running Tasks" });
    expect(runningHeadings.length).toBeGreaterThan(0);
    const descriptions = screen.getAllByText("Currently active jobs across workers.");
    expect(descriptions.length).toBeGreaterThan(0);
  });

  test("renders recent tasks section", () => {
    render(() => <TasksPage />);
    const recentHeadings = screen.getAllByRole("heading", { name: "Recent Tasks" });
    expect(recentHeadings.length).toBeGreaterThan(0);
    const descriptions = screen.getAllByText("Recently completed, failed, or canceled jobs.");
    expect(descriptions.length).toBeGreaterThan(0);
  });

  test("displays running job in list", () => {
    render(() => <TasksPage />);
    // Use queryAllByText as job may appear in multiple sections
    expect(screen.queryAllByText(/Analyze image/).length).toBeGreaterThan(0);
  });

  test("displays succeeded job in list", () => {
    render(() => <TasksPage />);
    // Use queryAllByText as job may appear in multiple sections
    expect(screen.queryAllByText(/Implement feature X/).length).toBeGreaterThan(0);
  });

  test("displays progress message for running job", () => {
    render(() => <TasksPage />);
    // Progress message may appear multiple times (in list and detail)
    expect(screen.queryAllByText("Processing...").length).toBeGreaterThan(0);
  });
});
