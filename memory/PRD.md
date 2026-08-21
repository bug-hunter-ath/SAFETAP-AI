# SafeTap AI — MVP PRD

## Problem statement
SafeTap AI helps people and security teams detect, verify, classify, score, link, and report phishing and brand-impersonation threats from suspicious URLs.

## Architecture
- Expo SDK 54 React Native mobile client with dark security command-center UI.
- FastAPI backend on `/api`, MongoDB case persistence, role-scoped bearer sessions.
- Deterministic URL risk signals combined with current-threat adapter output and optional Emergent universal LLM explanations.

## User personas
- Victim/User: wants a fast, understandable safety answer and next steps.
- Investigator: triages cases, evidence, scores, correlations, and campaign context.
- Admin: monitors platform entities, data sources, and system analytics.

## Core requirements (static)
- Three separate role login experiences with automatic dashboard routing.
- Victim isolation from investigator/admin functionality.
- URL scan, explainable 0–100 score, classification, factors, current-feed match, and case evidence.
- Historical Kaggle signal source separated from current OpenPhish/PhishTank adapter.
- Secure role authorization on privileged backend endpoints.

## Implemented — 2026-08-21
- Built role-selection login with demo accounts for Victim, Investigator, and Admin.
- Built Victim scan desk with phishing heuristics, current-threat indicator, evidence summary, and safety guidance.
- Built Investigator metrics/relationship-graph preview and Admin source/system snapshot.
- Added MongoDB case persistence, protected overview/case endpoints, logout, stable test IDs, and universal-key AI explanation with fallback.
- Verified backend and mobile flows with lint, curl, preview automation, and two full test-agent passes.

## Prioritized backlog
- P0: Add screenshot upload/OCR and visual/DOM similarity pipeline.
- P0: Add authenticated victim-owned reports and report download generation.
- P1: Add persisted Brand Registry and investigator case detail screens.
- P1: Implement live OpenPhish/PhishTank feed fetch, normalization, caching, and timestamps from configured environment variables.
- P1: Add interactive graph nodes/edges from shared fingerprints and related cases.
- P2: Add admin user/investigator management and analytics charts.

## Remaining P0/P1/P2 tasks
- P0: Expand scan workflow beyond URL-only heuristics without treating dataset matches as proof.
- P1: Add screenshot evidence storage and report export.
- P2: Add continuous feed refresh and broad social/marketplace connectors.