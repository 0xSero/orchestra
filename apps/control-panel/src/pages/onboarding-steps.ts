export type OnboardingStep = {
  id: "welcome" | "council" | "multimodal" | "wrap";
  title: string;
  estimate: string;
  description: string;
  bullets: string[];
  mode?: "council" | "multimodal";
  actionLabel?: string;
};

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    title: "Welcome",
    estimate: "0:30",
    description: "A quick tour of the two guided demos.",
    bullets: ["Workers Council consensus", "Multimodal + workflow demo", "Progress saved in SQLite"],
    actionLabel: "Start Council",
  },
  {
    id: "council",
    title: "Workers Council",
    estimate: "2:00",
    description: "Parallel worker prompts + consensus summary.",
    bullets: ["3 workers answer in parallel", "Consensus summary + next steps", "Timeboxed responses"],
    mode: "council",
    actionLabel: "Run Council",
  },
  {
    id: "multimodal",
    title: "Multimodal Demo",
    estimate: "2:00",
    description: "GLM-4.7 vision + native workflow run.",
    bullets: ["Vision output from GLM demo profile", "Run a built-in workflow", "See step-by-step results"],
    mode: "multimodal",
    actionLabel: "Run Multimodal Demo",
  },
  {
    id: "wrap",
    title: "Wrap Up",
    estimate: "0:30",
    description: "Lock in your progress and jump into the app.",
    bullets: ["Mark onboarding complete", "Optional restart anytime", "Explore settings and profiles"],
    actionLabel: "Mark Complete",
  },
];
