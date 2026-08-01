---
name: codegraph
description: Use the CodeGraph MCP tools as the primary way to navigate and understand this codebase before writing or editing code.
---

# CodeGraph

## Requires the CodeGraph MCP server

This skill only works once [CodeGraph](https://github.com/colbymchenry/codegraph) is installed and indexing this project — it is a separate tool, not something `claude-workspace` bundles:

```bash
curl -fsSL https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.sh | sh
codegraph install   # wires the MCP server into Claude Code
codegraph init      # builds this project's index
```

If the `codegraph_*` tools below are not available, the server isn't connected yet — install it first, then reload.

## Purpose

CodeGraph indexes every symbol, edge and file in this workspace. Reads are near-instant and stay close to the true state of the code. Consult it **before** writing or editing code, not while guessing from memory.

## When to reach for it

- "How does X work?", "where is Y defined?", "what calls this?" — answer directly with CodeGraph rather than delegating to a sub-task or running an ad-hoc grep/read loop.
- Before touching a function, check what depends on it so a change doesn't silently break a caller.

## Tool selection

- Symbol lookup by name → `codegraph_search`
- "What's the deal with this feature/area?" → `codegraph_context` (composes search + callers + callees)
- "How does X reach Y?" → `codegraph_trace`
- "What calls this?" / "what does this call?" → `codegraph_callers` / `codegraph_callees`
- "What would changing this break?" → `codegraph_impact`
- Read a symbol's source/signature → `codegraph_node`; survey several related symbols → `codegraph_explore`

Fall back to plain `Read`/`Grep` only to confirm a specific detail CodeGraph did not cover.
