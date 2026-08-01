---
name: health-review
description: Periodic project health audit for learning-focused React and TypeScript projects. Reviews architecture, maintainability, design consistency, TypeScript quality, recurring issues and learning opportunities. Provides evidence-based, actionable feedback while respecting learning-guard.
---

# Health Review

## Purpose

Perform a structured, evidence-based health check of the current project.

Identify:

- real problems;
- architectural drift;
- recurring mistakes;
- maintainability risks;
- learning opportunities.

Preserve good decisions.

Guide the human toward improvements without taking over implementation.

---

# Review Philosophy

## Evidence First

Only report findings supported by evidence in the codebase.

If something is uncertain, present it as a question or hypothesis rather than a conclusion.

---

## Context Over Rules

Evaluate decisions within the project's context.

Avoid suggesting changes solely because another approach exists.

A pattern that is usually discouraged may still be the correct choice for this project.

---

## Preserve Stability

Do not recommend refactoring working code without meaningful benefit.

Prefer consistency over stylistic perfection.

Detect architectural drift and regressions before isolated imperfections.

---

## Look for Patterns

Repeated issues are more important than isolated mistakes.

Focus on trends that indicate:

- missing understanding;
- inconsistent habits;
- architectural decay.

---

# When to Run

Run when:

- the user requests `/health`, `/review` or `/review-project`;
- roughly every 15–25 commits;
- before major refactors;
- the project begins feeling inconsistent or difficult to maintain.

---

# Review Areas

## 1. UI / UX

Review:

- visual consistency;
- spacing;
- typography;
- colors;
- accessibility;
- hover, focus, loading and empty states;
- consistency with the design system.

Identify visual regressions rather than personal preferences.

---

## 2. Responsive Design

Check whether:

- mobile-first principles remain consistent;
- layouts scale correctly;
- important breakpoints behave as expected.

---

## 3. TypeScript

Review:

- use of `any`;
- overly broad types;
- unnecessary assertions;
- missing narrowing;
- type inference opportunities;
- validation with Zod where appropriate.

Assume strict TypeScript.

---

## 4. Architecture

Review:

- Feature-Sliced Design boundaries;
- dependency direction;
- import rules;
- separation of concerns;
- layer responsibilities;
- cohesion and coupling.

Look for architectural drift rather than isolated violations.

---

## 5. State Management

Review boundaries between:

- server state;
- client state;
- local UI state.

Evaluate:

- React Query usage;
- Zustand usage;
- query invalidation;
- query keys;
- unnecessary global state;
- form architecture;
- React Hook Form and Zod integration.

---

## 6. Maintainability

Review:

- duplication;
- dead code;
- unused exports;
- commented code;
- component complexity;
- naming consistency;
- folder organization.

Recommend splitting code only when complexity meaningfully affects readability or maintenance.

---

## 7. Learning Signals

Identify recurring learning patterns.

Differentiate between:

- accidental mistakes;
- knowledge gaps;
- inconsistent habits.

Recommend concepts to revisit rather than only pointing out errors.

---

# Report Format

## Overall Summary

Provide:

- overall project status;
- main strengths;
- highest-priority risks.

---

## Health Scores

Estimate (0–10):

- Architecture
- TypeScript
- UI / UX
- Maintainability
- Learning Progress

Also provide an overall score.

Scores should indicate trends rather than absolute quality.

---

## Findings

For each significant finding include:

- evidence (files, components or locations);
- severity;
- explanation;
- recommended direction.

Severity levels:

- Critical
- High
- Medium
- Low
- Nice to Have

---

## Action Plan

### Fix Now

High-impact issues.

### Fix Soon

Important improvements.

### Watch Later

Minor improvements or stylistic cleanup.

---

## Reflection Questions

Ask 2–5 questions that encourage architectural thinking.

Examples:

- Why is this state global?
- Could this dependency move to a lower layer?
- Is this component responsible for more than one concern?
- What trade-off did you optimize for?

Questions should encourage reasoning rather than test memory.

---

## Suggested Learning Topic

Recommend one concept whose deeper understanding would provide the greatest improvement.

Explain why this topic is the highest leverage.

---

## Positive Observations

Highlight good engineering decisions.

Reinforce successful patterns.

Explain *why* they are good so the human is encouraged to repeat them.

---

# Rules

- Respect learning-guard at all times.
- Never rewrite entire features.
- Small snippets (1–5 lines) are acceptable only to illustrate a recommendation.
- Prefer questions over solutions.
- Be honest, specific and constructive.
- Preserve existing good patterns.
- If project-specific tooling (such as Impeccable) is available, recommend appropriate commands where helpful.