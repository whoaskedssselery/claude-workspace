---
name: debug-mode
description: Structured debugging workflow for any stack — reproduce, isolate, diagnose, fix, in that order. Replaces trial-and-error guessing (changing things and re-testing until something works) with a documented investigation, so the actual root cause gets found and recorded instead of just the first change that happened to help.
---

# Debug Mode

## Core Philosophy

Debugging is an investigation, not a series of guesses.

The failure mode this exists to prevent: changing something, re-running, seeing it's still broken (or seeming fixed for the wrong reason), changing something else, repeating across several sessions, until eventually something works — without ever knowing *why* it was broken or *why* the fix worked. That's expensive (it eats sessions) and fragile (the same class of bug comes back, because the actual cause was never found).

Follow the four stages below, in order. Do not propose a fix before Isolate and Diagnose are done — a fix proposed before the cause is known is a guess, not a fix, even if it happens to work.

---

# The Four Stages

## 1. Reproduce

Get a reliable way to trigger the failure before touching anything.

- State the exact steps, command, or trigger.
- Note whether it's consistent or intermittent — intermittent bugs need more repro attempts before concluding anything.
- Capture the actual observed output/error, not a paraphrase of it.
- If it can't be reproduced yet, that's the current task — don't skip ahead to guessing fixes for a failure that hasn't been pinned down.

## 2. Isolate

Narrow down *where* the problem is, not yet *why*.

- Bisect: remove/disable/mock pieces until the failure stops, or add pieces back until it starts. Binary search over "does the bug still happen" beats guessing which piece is at fault.
- Change exactly one variable at a time. Changing several things between test runs makes it impossible to know which change mattered.
- Note what's been ruled out, not just what's left — a shrinking list of suspects is real progress even without a fix yet.

## 3. Diagnose

Explain *why* it fails, in terms of the isolated component from step 2.

- State the actual mechanism (race condition, off-by-one, stale cache, wrong assumption about an API, environment difference, etc.) — not just "it's something in X."
- If there are multiple plausible explanations, say so and pick the cheapest one to test next, rather than the first one that comes to mind.
- A diagnosis should let you predict something else about the bug (e.g. "if that's the cause, it should also happen when Y") — check that prediction before moving on if it's cheap to check.

## 4. Fix

Only now propose a change.

- The fix should map directly to the diagnosis from step 3 — if it doesn't obviously address the stated cause, the diagnosis was probably wrong or incomplete; go back to step 3.
- Prefer the smallest change that addresses the actual cause over a broader change that happens to also make the symptom go away.
- Verify the fix against the reproduction from step 1, not just "it looks right."
- If the fix works but the mechanism from step 3 doesn't actually explain why, say so explicitly — an unexplained fix is a hypothesis that got lucky, not a closed investigation, and probably deserves a comment noting the uncertainty.

---

# When Stuck

If isolation or diagnosis stalls (several hypotheses ruled out, no clear next one):

- Say so explicitly rather than reaching for another guess.
- Summarize what's been ruled out and what's still unknown — this is often what surfaces the answer on its own.
- Ask the human, or suggest a specific next narrowing step, instead of trying random changes hoping one sticks.

---

# Session Log

For anything that takes more than a couple of exchanges to resolve, keep a running short log across the session:

- what was tried
- what it ruled out or confirmed
- current leading hypothesis

This is what actually prevents re-litigating the same dead end twice in one session, and it's the raw material for the summary below.

---

# On Resolution

Once fixed, state in a few lines:

- root cause (the mechanism from step 3, not just the symptom)
- the fix and why it addresses that mechanism
- whether anything else in the codebase likely has the same class of bug

This is worth keeping somewhere durable (a commit message, a code comment near the fix, or project memory if this agent has one) — the goal is that the same root cause doesn't need to be rediscovered next time it resurfaces.

---

# Rules

- Do not skip to Fix before Isolate and Diagnose are actually done.
- Do not change more than one variable per test when isolating.
- Do not accept "it works now" as diagnosis — state the mechanism.
- Prefer the smallest change that addresses the diagnosed cause.
- When stuck, say so and narrow further rather than guessing.
- Respect learning-guard where it applies — in a learning project, guide the human through these stages rather than performing them unilaterally.
