import type { WorkflowDefinition } from "./types";

export function buildBuiltinWorkflows(): WorkflowDefinition[] {
  return [
    {
      id: "bug-triage",
      name: "Bug Triage",
      description: "Collect context, propose a fix, and review for risks.",
      steps: [
        {
          id: "triage-scan",
          title: "Scan Context",
          workerId: "explorer",
          prompt:
            "Scan the repo for context related to: {task}.\n" +
            "Return relevant files, symbols, and a brief summary of findings.",
          carry: true,
        },
        {
          id: "triage-fix",
          title: "Propose Fix",
          workerId: "coder",
          prompt:
            "Propose a fix for: {task}.\n" +
            "Use this context if helpful:\n{carry}\n" +
            "Return a concise plan and any code-level guidance.",
          carry: true,
        },
        {
          id: "triage-review",
          title: "Risk Review",
          workerId: "reviewer",
          prompt:
            "Review the proposed fix for risks, regressions, or missing tests.\n" +
            "Context:\n{carry}\n" +
            "Return actionable review feedback.",
        },
      ],
    },
    {
      id: "security-audit",
      name: "Security Audit",
      description: "Identify security risks and recommend mitigations.",
      steps: [
        {
          id: "security-findings",
          title: "Threat Scan",
          workerId: "security",
          prompt:
            "Analyze security risks for: {task}.\n" +
            "Identify threats, vulnerable patterns, and data exposure concerns.",
          carry: true,
        },
        {
          id: "security-review",
          title: "Review Findings",
          workerId: "reviewer",
          prompt:
            "Review the security findings for clarity and completeness.\n" +
            "Context:\n{carry}\n" +
            "Suggest any missing risks or mitigations.",
          carry: true,
        },
        {
          id: "security-mitigations",
          title: "Mitigation Plan",
          workerId: "architect",
          prompt:
            "Propose a mitigation plan based on the security findings.\n" +
            "Context:\n{carry}\n" +
            "Return prioritized mitigation steps.",
        },
      ],
    },
    {
      id: "qa-regression",
      name: "QA Regression",
      description: "Design test plan, propose fixes, and verify outcomes.",
      steps: [
        {
          id: "qa-plan",
          title: "Test Plan",
          workerId: "qa",
          prompt: "Draft a focused regression test plan for: {task}.\n" + "Include repro steps and expected outcomes.",
          carry: true,
        },
        {
          id: "qa-fix",
          title: "Implementation Notes",
          workerId: "coder",
          prompt:
            "Given this QA plan, propose implementation or fixes for: {task}.\n" +
            "Context:\n{carry}\n" +
            "Return a concise plan.",
          carry: true,
        },
        {
          id: "qa-verify",
          title: "Verification",
          workerId: "qa",
          prompt:
            "Verify expected behavior based on the plan and notes.\n" +
            "Context:\n{carry}\n" +
            "Return a checklist of verifications.",
        },
      ],
    },
    {
      id: "spec-to-implementation",
      name: "Spec to Implementation",
      description: "Turn requirements into an implementation plan with review.",
      steps: [
        {
          id: "spec",
          title: "Requirements",
          workerId: "product",
          prompt:
            "Turn this task into a short spec with acceptance criteria:\n{task}\n" +
            "Be explicit about scope and edge cases.",
          carry: true,
        },
        {
          id: "architecture",
          title: "Architecture Plan",
          workerId: "architect",
          prompt:
            "Design an implementation approach for the spec.\n" +
            "Context:\n{carry}\n" +
            "Return a high-level plan and risks.",
          carry: true,
        },
        {
          id: "implementation",
          title: "Implementation Steps",
          workerId: "coder",
          prompt:
            "Outline concrete implementation steps based on the plan.\n" +
            "Context:\n{carry}\n" +
            "Include tests to add or update.",
          carry: true,
        },
        {
          id: "review",
          title: "Review Plan",
          workerId: "reviewer",
          prompt:
            "Review the implementation steps for gaps and missing tests.\n" +
            "Context:\n{carry}\n" +
            "Return review notes.",
        },
      ],
    },
    {
      id: "data-digest",
      name: "Data Digest",
      description: "Summarize metrics, research context, and validate insights.",
      steps: [
        {
          id: "insights",
          title: "Insights",
          workerId: "analyst",
          prompt: "Summarize the key insights for: {task}.\n" + "Call out trends, anomalies, and likely drivers.",
          carry: true,
        },
        {
          id: "context",
          title: "Context Research",
          workerId: "docs",
          prompt:
            "Provide supporting context or references for the insights.\n" +
            "Context:\n{carry}\n" +
            "Cite sources or internal references if available.",
          carry: true,
        },
        {
          id: "validation",
          title: "Validation",
          workerId: "reviewer",
          prompt:
            "Validate the insights for accuracy and missing data.\n" +
            "Context:\n{carry}\n" +
            "Return any concerns or follow-ups.",
        },
      ],
    },
  ];
}
