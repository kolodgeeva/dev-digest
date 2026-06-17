---
name: engineering-insights
description: "Capture non-obvious engineering insights into the right package's INSIGHTS.md so future sessions don't re-derive them. Use this proactively whenever a session surfaces something worth remembering — a pattern that works, a mistake/antipattern to avoid, an architectural decision and its reason, a tool/library gotcha, or a recurring error and its fix — AND as an end-of-session wrap-up when the user runs /engineering-insights. Trigger even when the user doesn't explicitly ask to 'save' something, as long as the finding is non-trivial and would help a future engineer."
allowed-tools: Read, Edit, Write, Grep, Glob
metadata:
  tags: insights, learnings, memory, retrospective, knowledge-capture, wrap-up
---

# Engineering Insights

Leave notes the next session will thank you for. Two moments to write: **as you go**,
the instant a non-obvious finding is confirmed; and at **wrap-up**, when invoked as
`/engineering-insights` after a substantive session (>30 min with a real
problem/decision/discovery — skip trivial config edits; signal quality over volume).

1. **Pick the file by what the work touched** — append to the `INSIGHTS.md` of that
   package: `server/`, `client/`, `reviewer-core/`, or `e2e/`. Cross-cutting → root
   `INSIGHTS.md`. A change spanning packages → write to each touched package's file.
2. **Append under the matching section** of the file's 7-section template. One entry:
   `YYYY-MM-DD · category · the insight · evidence (file:line)`.
3. **Write it actionable and "cold"** — a future agent reads it with zero session
   context and *knows what to do*. Anti-banality test: *if it's obvious to anyone
   reading the code, don't write it.* Bad: "be careful with async." Good: "repo-intel
   ingest must batch embedding calls with `Promise.allSettled` (10 at a time); plain
   `Promise.all` over the full file list times out — `server/src/modules/repo-intel/...`."
4. **Append-only.** Never overwrite or delete; correct a stale entry with a new dated
   note that references the old one.

Maintenance rules (prune monthly, resolve contradictions, split past ~200 entries,
treat as a draft under human spot-check) live in each `INSIGHTS.md` preamble.
