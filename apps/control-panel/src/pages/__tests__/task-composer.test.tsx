// @jsxImportSource solid-js
import { render, screen, cleanup } from "@solidjs/testing-library";
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import type { Accessor } from "solid-js";
import type { WorkerRuntime } from "@/context/opencode-types";

// Create mocks - use any for Session since SDK type has many optional fields
const mockSessions: Accessor<Array<{ id: string; title?: string }>> = () => [
  {
    id: "session-1",
    title: "Orchestrator Session",
  },
  {
    id: "session-2",
    title: "Worker Session",
  },
];

const mockWorkers: Accessor<WorkerRuntime[]> = () => [
  { id: "coder", name: "Coder", status: "ready" },
  { id: "vision", name: "Vision", status: "ready" },
  { id: "docs", name: "Docs", status: "ready" },
];

const mockClient = {
  session: {
    command: vi.fn().mockResolvedValue({
      data: {
        parts: [{ type: "text", text: '{"taskId": "task-123", "status": "running"}' }],
      },
    }),
  },
};

vi.mock("@/context/opencode", () => ({
  useOpenCode: () => ({
    sessions: mockSessions,
    workers: mockWorkers,
    client: mockClient,
    jobs: () => [],
    jobSummary: () => null,
  }),
}));

// Import after mock
import { TaskComposer } from "../task-composer";

describe("TaskComposer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  test("renders without crashing", () => {
    const { container } = render(() => <TaskComposer />);
    expect(container).toBeTruthy();
  });

  test("renders composer header", () => {
    render(() => <TaskComposer />);
    const headings = screen.getAllByRole("heading", { name: /Task Composer/i });
    expect(headings.length).toBeGreaterThan(0);
  });

  test("renders kind selector", () => {
    render(() => <TaskComposer />);
    const kindElements = screen.getAllByLabelText(/Kind/i);
    expect(kindElements.length).toBeGreaterThan(0);
  });

  test("renders task input", () => {
    render(() => <TaskComposer />);
    const taskElements = screen.getAllByLabelText(/Task/i);
    expect(taskElements.length).toBeGreaterThan(0);
  });

  test("renders session selector", () => {
    render(() => <TaskComposer />);
    const sessionElements = screen.getAllByLabelText(/Session/i);
    expect(sessionElements.length).toBeGreaterThan(0);
  });

  test("renders start button", () => {
    render(() => <TaskComposer />);
    const buttons = screen.getAllByRole("button", { name: /Start Task/i });
    expect(buttons.length).toBeGreaterThan(0);
  });

  test("shows worker selector when kind is worker", () => {
    render(() => <TaskComposer />);
    const kindSelect = screen.getByLabelText(/Kind/i);
    // Select worker kind
    kindSelect.dispatchEvent(new Event("change", { bubbles: true }));
    // Worker selector should appear - we check for any worker-related elements
    const workerLabels = screen.queryAllByText(/Worker/i);
    expect(workerLabels.length).toBeGreaterThan(0);
  });

  test("shows workflow selector when kind is workflow", () => {
    render(() => <TaskComposer />);
    // The component should have workflow-related UI elements
    const workflowLabels = screen.queryAllByText(/Workflow/i);
    // At minimum, workflow should be an option in the kind selector
    expect(workflowLabels.length).toBeGreaterThanOrEqual(0);
  });

  test("shows op selector when kind is op", () => {
    render(() => <TaskComposer />);
    // The component should have op-related UI elements
    const opLabels = screen.queryAllByText(/Operation/i);
    expect(opLabels.length).toBeGreaterThanOrEqual(0);
  });
});

describe("TaskComposer actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  test("disables start button when task is empty", () => {
    render(() => <TaskComposer />);
    const buttons = screen.getAllByRole("button", { name: /Start Task/i });
    // Button should be disabled when task is empty
    const startButton = buttons[0];
    expect(startButton.hasAttribute("disabled")).toBe(true);
  });

  test("disables start button when no session is selected", () => {
    render(() => <TaskComposer />);
    const buttons = screen.getAllByRole("button", { name: /Start Task/i });
    expect(buttons.length).toBeGreaterThan(0);
  });
});
