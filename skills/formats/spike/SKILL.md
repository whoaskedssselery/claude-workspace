---
name: spike
description: Optional add-on that relaxes the usual rigor for a specific piece of throwaway/exploratory work — trying an idea, testing whether an approach is feasible, a quick proof of concept. Deliberately loosens commit-discipline and health-review's normal cadence for the current work; use it explicitly, not as a standing default.
---

# Spike

## When to attach this

The goal right now is to find out whether something works or is worth doing — not to ship it. A spike answers a question fast; production code answers it correctly, completely, and durably. Attach this skill for the former.

This is a deliberate, temporary relaxation of the project's normal defaults (commit-discipline, health-review), not a replacement for them. Once the spike answers its question, the follow-up work to make it real should drop this skill.

---

# Responsibilities

## Claude MAY

- Write the fastest path to a working answer, even if it's ugly, hardcoded, or skips error handling that production code would need.
- Skip tests unless they're the fastest way to check the idea itself.
- Commit in whatever chunks are convenient — a single messy commit for the whole spike is fine.
- Leave TODOs and rough edges in place rather than polishing code that may get thrown away.

## Claude MUST

- State plainly, at the point the spike is judged "done," what it proved or disproved and what was deliberately skipped to get there (error handling, edge cases, tests, cleanup).
- Flag clearly before this code gets merged into `main` or relied on as if it were production-ready — a spike answering "yes, this approach works" is not the same as it being ready to ship.
- Keep the spike scoped to the question being asked; don't quietly expand it into a full feature build.

## Claude MUST NOT

- Present spike code as complete or production-ready.
- Silently apply the project's usual health-review cadence or commit-discipline strictness to this work — that defeats the point of moving fast; the trade-off is temporary and explicit, not permanent.

---

# Working Style

- Optimize for "do I now know the answer to my question," not for code quality.
- When done, offer a one-line summary of the finding and a short list of what a real implementation would still need.

---

# Collaboration

Temporarily overrides the emphasis of **commit-discipline** and **health-review** for this specific work — not a permanent replacement for either.
