/**
 * Onboarding Page - 5-minute guided setup flow
 */

import { useNavigate } from "@solidjs/router";
import { type Component, createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDb } from "@/context/db";
import { useOpenCode } from "@/context/opencode";
import { cn } from "@/lib/utils";

type OnboardingStep = {
  id: "welcome" | "council" | "multimodal" | "wrap";
  title: string;
  estimate: string;
  description: string;
  bullets: string[];
  mode?: "council" | "multimodal";
  actionLabel?: string;
};

const STEPS: OnboardingStep[] = [
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

// session.command returns message parts; pull just the text for display.
function extractText(parts: Array<{ type?: string; text?: string }> | undefined): string {
  if (!parts || parts.length === 0) return "";
  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n");
}

export const OnboardingPage: Component = () => {
  const navigate = useNavigate();
  const { client, createSession } = useOpenCode();
  const { preferences, setPreference, deletePreference, markOnboarded, ready } = useDb();

  const [currentStep, setCurrentStep] = createSignal(0);
  const [initialized, setInitialized] = createSignal(false);
  const [sessionId, setSessionId] = createSignal<string | null>(null);
  const [running, setRunning] = createSignal<"council" | "multimodal" | null>(null);
  const [councilOutput, setCouncilOutput] = createSignal("");
  const [multimodalOutput, setMultimodalOutput] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);

  const completed = () => preferences()["onboarding.completed"] === "true";
  const skipped = () => preferences()["onboarding.skipped"] === "true";

  const step = createMemo(() => STEPS[currentStep()] ?? STEPS[0]);
  const progress = createMemo(() => Math.round(((currentStep() + 1) / STEPS.length) * 100));

  createEffect(() => {
    if (!ready() || initialized()) return;
    const stored = preferences()["onboarding.step"];
    const index = stored ? STEPS.findIndex((s) => s.id === stored) : 0;
    if (index >= 0) setCurrentStep(index);
    setInitialized(true);
  });

  createEffect(() => {
    if (!ready() || !initialized()) return;
    const nextStep = STEPS[currentStep()]?.id ?? "welcome";
    void setPreference("onboarding.step", nextStep);
  });

  const ensureSession = async () => {
    if (sessionId()) return sessionId() as string;
    const session = await createSession();
    if (!session) throw new Error("Failed to create onboarding session.");
    setSessionId(session.id);
    return session.id;
  };

  const clearSkip = async () => {
    if (!skipped()) return;
    await setPreference("onboarding.skipped", "false");
  };

  const runFlow = async (mode: "council" | "multimodal") => {
    setRunning(mode);
    setError(null);
    await clearSkip();
    try {
      const id = await ensureSession();
      const res = await client.session.command({
        path: { id },
        body: { command: "orchestrator.onboard", arguments: `--mode ${mode}` },
      });
      const output = extractText(res.data?.parts as Array<{ type?: string; text?: string }>);
      if (mode === "council") {
        setCouncilOutput(output || "No council output was returned.");
      } else {
        setMultimodalOutput(output || "No multimodal output was returned.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setRunning(null);
    }
  };

  const goToStep = async (index: number) => {
    await clearSkip();
    setCurrentStep(Math.min(Math.max(index, 0), STEPS.length - 1));
  };

  const nextStep = async () => {
    await goToStep(currentStep() + 1);
  };

  const prevStep = async () => {
    await goToStep(currentStep() - 1);
  };

  const handleSkip = async () => {
    await setPreference("onboarding.skipped", "true");
    navigate("/chat");
  };

  const markComplete = async () => {
    await setPreference("onboarding.completed", "true");
    await setPreference("onboarding.skipped", "false");
    await markOnboarded();
  };

  const restart = async () => {
    await deletePreference("onboarding.completed");
    await deletePreference("onboarding.step");
    await deletePreference("onboarding.skipped");
    setCouncilOutput("");
    setMultimodalOutput("");
    setCurrentStep(0);
  };

  return (
    <div class="flex-1 overflow-auto p-6">
      <div class="max-w-5xl mx-auto space-y-6 animate-fade-in">
        <Card>
          <CardHeader>
            <CardTitle>5-Minute Onboarding</CardTitle>
            <CardDescription>
              Two guided demos (Workers Council + Multimodal Workflow). Total time: ~5 minutes.
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="flex items-center justify-between text-xs text-muted-foreground">
              <span>Progress</span>
              <span>{progress()}%</span>
            </div>
            <div class="h-2 rounded-full bg-muted overflow-hidden">
              <div class="h-full bg-primary" style={{ width: `${progress()}%` }} />
            </div>
            <Show when={completed()}>
              <div class="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
                Onboarding complete. You can restart at any time.
              </div>
            </Show>
            <Show when={skipped() && !completed()}>
              <div class="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
                Onboarding is paused. Resume when you are ready.
              </div>
            </Show>
          </CardContent>
        </Card>

        <div class="grid gap-6 lg:grid-cols-[240px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle class="text-sm">Steps</CardTitle>
            </CardHeader>
            <CardContent class="space-y-2">
              <For each={STEPS}>
                {(stepItem, index) => (
                  <button
                    class={cn(
                      "w-full rounded-md px-3 py-2 text-left text-xs transition",
                      index() === currentStep()
                        ? "bg-primary/10 text-primary border border-primary/30"
                        : "border border-transparent hover:border-border hover:bg-muted/40",
                    )}
                    onClick={() => void goToStep(index())}
                  >
                    <div class="flex items-center justify-between">
                      <span class="font-semibold">{stepItem.title}</span>
                      <span class="text-[10px] text-muted-foreground">{stepItem.estimate}</span>
                    </div>
                    <div class="text-[11px] text-muted-foreground mt-1">{stepItem.description}</div>
                  </button>
                )}
              </For>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle class="text-sm">
                {step().title} <span class="text-xs text-muted-foreground">({step().estimate})</span>
              </CardTitle>
              <CardDescription>{step().description}</CardDescription>
            </CardHeader>
            <CardContent class="space-y-4">
              <ul class="grid gap-2 text-xs text-muted-foreground">
                <For each={step().bullets}>{(item) => <li>• {item}</li>}</For>
              </ul>

              <Show when={step().mode === "council"}>
                <div class="space-y-2">
                  <Button size="sm" onClick={() => void runFlow("council")} disabled={running() !== null}>
                    {running() === "council" ? "Running Council..." : (step().actionLabel ?? "Run Council")}
                  </Button>
                  <Show when={councilOutput()}>
                    <pre class="whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-xs text-foreground">
                      {councilOutput()}
                    </pre>
                  </Show>
                </div>
              </Show>

              <Show when={step().mode === "multimodal"}>
                <div class="space-y-2">
                  <Button size="sm" onClick={() => void runFlow("multimodal")} disabled={running() !== null}>
                    {running() === "multimodal"
                      ? "Running Multimodal..."
                      : (step().actionLabel ?? "Run Multimodal Demo")}
                  </Button>
                  <Show when={multimodalOutput()}>
                    <pre class="whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-xs text-foreground">
                      {multimodalOutput()}
                    </pre>
                  </Show>
                </div>
              </Show>

              <Show when={step().id === "wrap"}>
                <div class="space-y-2">
                  <Button size="sm" onClick={() => void markComplete()} disabled={completed()}>
                    {completed() ? "Completed" : (step().actionLabel ?? "Mark Complete")}
                  </Button>
                  <p class="text-xs text-muted-foreground">You can restart onboarding from this page any time.</p>
                </div>
              </Show>

              <Show when={error()}>
                <div class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error()}
                </div>
              </Show>

              <div class="flex flex-wrap items-center gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => void prevStep()} disabled={currentStep() === 0}>
                  Back
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void nextStep()}
                  disabled={currentStep() >= STEPS.length - 1}
                >
                  Next
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void handleSkip()}>
                  Skip for now
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void restart()}>
                  Restart
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
