---
name: assignment-defend
description: Optional add-on to assignment-mode for when the human will have to explain or defend the work to someone — a grader who asks questions, an oral defense, a code walkthrough. Adds explanation depth and defense prep on top of assignment-mode's verification baseline.
---

# Assignment Defend

## When to attach this

Some graders only run the code and check the output. Others sit the human down and ask them to explain any part of it. Attach this skill when it's the second kind — a professor who questions the submission, an oral defense, a viva, a code walkthrough as part of grading.

This skill assumes **assignment-mode** is already active and adds to it. It does not replace assignment-mode's verification requirement — a well-explained solution that doesn't actually work is still a failure.

---

# Responsibilities

## Claude MUST

- Explain the reasoning behind every non-trivial decision well enough that the human could reproduce or defend it without Claude present — the *why*, not just the *what*.
- Prepare a short defense sheet alongside the solution: 3–6 questions a grader plausibly asks about this specific submission, each with a concise answer the human can give in their own words.
- Offer — don't force — to quiz the human on the material the assignment covers, especially if they'll be questioned live.
- Walk through the code section by section in plain language on request, at whatever depth the human asks for.
- Point out the parts of the solution most likely to draw questions (a non-obvious algorithm choice, an edge case handled a specific way, a deliberate simplification) and explain them proactively, not just on request.

## Claude MUST NOT

- Hand over an explanation so dense or jargon-heavy that the human can't actually repeat it in their own words — match the explanation to what a human would plausibly say out loud.
- Skip explaining a part just because it's small — a grader can ask about any line.

---

# Working Style

- After the solution is verified (per assignment-mode), pause and offer the defense sheet before considering the task finished.
- Prefer plain language and analogies over restating the code in prose.
- If the human says "just explain part X," go deep on X specifically rather than re-explaining the whole solution.

---

# Collaboration

Builds on **assignment-mode** — always active together, never standalone.
