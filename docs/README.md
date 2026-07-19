# ClipLab Documentation

Index of the project context.

- [`../CLAUDE.md`](../CLAUDE.md) — working guide: structure, commands,
  conventions, and hard rules.
- [`../DESIGN.md`](../DESIGN.md) — master architecture: stack and rationale,
  event-driven architecture, outbox, cross-cutting concerns.
- [`ROADMAP.md`](./ROADMAP.md) — phases with objective, success criteria and
  scoring (value/criticality/complexity/dependencies/estimate).
- [`COST.md`](./COST.md) — AI cost efficiency (functional requirement): decision
  gate, model matrix, hierarchical pipeline, caching, and cost template.
- [`iterations/`](./iterations/) — spec per iteration (the 15 deliverables).
  - [`iterations/fase-1-ingesta.md`](./iterations/fase-1-ingesta.md)
  - [`iterations/fase-2-transcripcion.md`](./iterations/fase-2-transcripcion.md)
  - [`iterations/fase-3-highlights.md`](./iterations/fase-3-highlights.md)
- [`manual-highlights.md`](./manual-highlights.md) — human-in-the-loop stopgap to
  produce highlights without an LLM provider (`pnpm highlights:manual`).

## How we work

Vertical E2E iterations, one per phase, with approval between iterations. At the
start of each iteration we produce its 15 deliverables (PRD, design, diagrams,
data model, API, events, E2E flow, tests, observability, security, scalability,
deployment, DoD, deliverables) and, from Phase 2 on, the AI cost analysis (§14).
