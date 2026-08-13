# EduVijna AIEOS Frontend

Application frontend for EduVijna **AIEOS** (Artificial Intelligence Engineering Education Operating System).

## Mission

Deliver the teacher-facing (and later school-facing) AIEOS experience — Teacher OS shell and UX — while calling **only** stable application services. The frontend must not call agents, MCP tools, or LLM providers directly (ADR-044).

## Purpose

This repository is the **AIEOS frontend implementation** workspace.

Architecture and product intelligence do **not** live here:

| Concern | Canonical home |
|---------|----------------|
| Enterprise architecture, ADRs, reviews | [eduvijna-architecture](https://github.com/eduvijna/eduvijna-architecture) |
| Product vision, Teacher OS product architecture, EBPs, EDRs | [eduvijna-product](https://github.com/eduvijna/eduvijna-product) |
| AIEOS backend / APIs / domain services | [eduvijna-aieos-backend](https://github.com/eduvijna/eduvijna-aieos-backend) |
| AIEOS frontend / Teacher OS shell | **this repository** |

## Repository Scope

In scope:

- Teacher OS shell and UX (ADR-042: shell owns UX, not business capability engines)
- Client-side routing, state, and presentation for AIEOS surfaces
- Integration with stable backend product services (Mission / Intent / Artifact façades)
- Feature-flagged delivery and classic-path coexistence
- Tests, CI, and frontend operational artefacts

Out of scope:

- Product vision, personas, journeys, and Teacher OS product architecture (Product Office)
- ADRs, EAO governance, and enterprise discovery (Architecture Office)
- Backend APIs, persistence, orchestrator, agents, MCP, or LLM providers (AIEOS backend)
- Direct frontend calls to agents, MCP tools, or LLM providers (forbidden — ADR-044)

## Repository Structure

| Path | Role |
|------|------|
| `README.md` | Mission, scope, and contribution entry |
| `CONTRIBUTING.md` | Contribution rules (aligned with architecture and product repos) |
| `CODEOWNERS` | Ownership map |
| `.github/` | Issue and pull-request templates |
| `src/` | Frontend implementation (to be added under approved blueprints) |
| `docs/` | Repository-local implementation notes (not ADRs) |

## Engineering Lifecycle

1. **Discover** — Confirm the change is authorised by an ADR, EBP, or Product Architecture Review.
2. **Decide** — Escalate architectural choices to `eduvijna-architecture`; implementation-only choices to EDRs in `eduvijna-product`.
3. **Implement** — Deliver a vertical slice behind feature flags; Teacher OS Shell must not re-implement generator / report / analytics engines.
4. **Review** — Pull request required; Architecture Review for material UX-boundary or contract-consuming changes.
5. **Validate** — No merge without automated tests appropriate to the slice.
6. **Govern** — Preserve Teacher OS shell ownership (ADR-042) and backend-only AI platform access (ADR-044).

## Contribution Workflow

1. Confirm the change belongs in this frontend repository (not architecture, product, or backend).
2. Open an issue using the appropriate template when the change is material.
3. Branch from `main` and keep the change focused.
4. Submit a pull request; merge requires review.
5. Architecture Review is required for material shell, navigation, or service-contract changes.
6. Follow `CONTRIBUTING.md`.

## Ownership

EduVijna Engineering, under Architecture Office and Product Office stewardship.

GitHub: [github.com/eduvijna/eduvijna-aieos-frontend](https://github.com/eduvijna/eduvijna-aieos-frontend)

## License

Copyright 2026 EduVijna

Licensed under the [Apache License, Version 2.0](LICENSE).
