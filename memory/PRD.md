# SafeTap AI — MVP PRD

## Problem statement
SafeTap AI helps people and security teams detect, verify, classify, score, link, and report phishing and brand-impersonation threats — from URLs, screenshots, social posts, and voice questions in Indian languages.

## Architecture
- Expo SDK 54 React Native mobile client, dark security-desk UI, modular sections per feature.
- FastAPI backend on `/api`, MongoDB case persistence, role-scoped bearer sessions with per-victim ownership.
- Deterministic URL heuristics + current-threat adapter + Emergent Universal LLM key for
  gpt-5.4 explanations, gpt-4o vision (OCR + clone hints), Whisper STT, OpenAI TTS in 10 languages.

## User personas
- Victim/User: scans URLs / screenshots / social posts, downloads own evidence, talks to voice assistant.
- Investigator: sees every case, workflow, and threat graph.
- Admin: sees platform snapshot, data sources, and AI languages online.

## Sections (per user request — each kept distinct in the Victim dashboard)
1. URL Scan — deterministic heuristics + LLM explanation + threat feed match.
2. Screenshot & OCR — gallery pick or paste image/data URL → gpt-4o OCR + brand look-alike + clone confidence.
3. Social Post Check — extract URLs, scam-language triggers, per-link risk.
4. Voice Safety Assistant — 9 Indian languages (Hindi, Bengali, Tamil, Telugu, Marathi, Kannada, Malayalam, Gujarati, Punjabi) + English; voice in + spoken out.
5. Threat Relationship Graph — interactive nodes for cases/domains/brands/fingerprints with edge details.
6. My Reports — history of victim-owned scans + shareable JSON evidence download.
7. Report a Cybercrime — 1930 tap-to-call + cybercrime.gov.in portal + evidence checklist.

## Implemented — 2026-08-21 (iteration 6)
- Modular frontend under `/app/frontend/src/safetap/`.
- Backend endpoints: `/scan`, `/scan/screenshot`, `/scan/social`, `/reports/mine`, `/reports/{id}`,
  `/assistant/transcribe`, `/assistant/reply`, `/assistant/languages`, `/graph`.
- Image fingerprint re-upload detection, correlation graph builder, victim-scoped case ownership.
- Voice pipeline uses Whisper for STT and OpenAI TTS for spoken replies in the picked Indian language.
- Verified end-to-end: 24/24 backend tests passing with live LLM calls.

## Prioritized backlog
- P1: Persisted Brand Registry + investigator case detail screens.
- P1: Live OpenPhish/PhishTank feed fetch with caching.
- P2: Admin user/investigator management + analytics charts.
- P2: Broader social/marketplace connectors and continuous feed refresh.
