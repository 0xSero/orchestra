/**
 * Onboarding Page - 5-minute guided setup flow
 */

import { useNavigate } from "@solidjs/router";
import { type Component, createEffect, createMemo, createSignal } from "solid-js";
import { useDb } from "@/context/db";
import { useOpenCode } from "@/context/opencode";
import { ONBOARDING_PREF_KEYS } from "@/lib/onboarding-constants";
import { OnboardingProgressCard } from "./onboarding-progress-card";
import { OnboardingStepList } from "./onboarding-step-list";
import { OnboardingStepPanel } from "./onboarding-step-panel";
import { ONBOARDING_STEPS } from "./onboarding-steps";
import { extractText } from "./onboarding-utils";

/** Guided onboarding flow for first-time users. */
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

  const completed = () => preferences()[ONBOARDING_PREF_KEYS.completed] === "true";
  const skipped = () => preferences()[ONBOARDING_PREF_KEYS.skipped] === "true";

  const step = createMemo(() => ONBOARDING_STEPS[currentStep()] ?? ONBOARDING_STEPS[0]);
  const progress = createMemo(() => Math.round(((currentStep() + 1) / ONBOARDING_STEPS.length) * 100));

  createEffect(() => {
    if (!ready() || initialized()) return;
    const stored = preferences()[ONBOARDING_PREF_KEYS.step];
    const index = stored ? ONBOARDING_STEPS.findIndex((candidate) => candidate.id === stored) : 0;
    if (index >= 0) setCurrentStep(index);
    setInitialized(true);
  });

  createEffect(() => {
    if (!ready() || !initialized()) return;
    const nextStep = ONBOARDING_STEPS[currentStep()]?.id ?? "welcome";
    void setPreference(ONBOARDING_PREF_KEYS.step, nextStep);
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
    await setPreference(ONBOARDING_PREF_KEYS.skipped, "false");
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
    setCurrentStep(Math.min(Math.max(index, 0), ONBOARDING_STEPS.length - 1));
  };

  const nextStep = async () => {
    await goToStep(currentStep() + 1);
  };

  const prevStep = async () => {
    await goToStep(currentStep() - 1);
  };

  const handleSkip = async () => {
    try {
      await setPreference(ONBOARDING_PREF_KEYS.skipped, "true");
    } catch {
      // API unavailable - store locally and continue
      localStorage.setItem("onboarding.skipped", "true");
    }
    navigate("/dashboard");
  };

  const markComplete = async () => {
    try {
      await setPreference(ONBOARDING_PREF_KEYS.completed, "true");
      await setPreference(ONBOARDING_PREF_KEYS.skipped, "false");
      await markOnboarded();
    } catch {
      // API unavailable - store locally and continue
      localStorage.setItem("onboarding.completed", "true");
    }
    navigate("/dashboard");
  };

  const restart = async () => {
    await deletePreference(ONBOARDING_PREF_KEYS.completed);
    await deletePreference(ONBOARDING_PREF_KEYS.step);
    await deletePreference(ONBOARDING_PREF_KEYS.skipped);
    setCouncilOutput("");
    setMultimodalOutput("");
    setCurrentStep(0);
  };

  return (
    <div class="flex-1 overflow-auto p-6">
      <div class="max-w-5xl mx-auto space-y-6 animate-fade-in">
        <OnboardingProgressCard progress={progress()} completed={completed()} skipped={skipped()} />

        <div class="grid gap-6 lg:grid-cols-[240px_1fr]">
          <OnboardingStepList steps={ONBOARDING_STEPS} currentStep={currentStep()} onSelectStep={goToStep} />
          <OnboardingStepPanel
            step={step()}
            running={running()}
            councilOutput={councilOutput()}
            multimodalOutput={multimodalOutput()}
            completed={completed()}
            error={error()}
            onRunFlow={runFlow}
            onMarkComplete={markComplete}
            onPrev={prevStep}
            onNext={nextStep}
            onSkip={handleSkip}
            onRestart={restart}
            canPrev={currentStep() > 0}
            canNext={currentStep() < ONBOARDING_STEPS.length - 1}
          />
        </div>
      </div>
    </div>
  );
};
