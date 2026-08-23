# IKIGAI Judging Brief --- SAFETAP-AI

**Track:** Cybersecurity, Digital Trust and Smart Surveillance

**Problem:** Detect suspected brand impersonation across URLs,
screenshots and social content, distinguish legitimate uses, score risk
explainably, generate evidence, and link related cases.

**Repository assessment:** The core MVP is implemented end-to-end for
URL, screenshot and social inputs, with persisted cases, explainable
scoring, AI vision/explanations, reports and basic re-upload/correlation
linking; full-scale crawling and robust intent/partner verification are
not demonstrated.

## What They Built

-   FastAPI + MongoDB backend accepts URL, screenshot and social-post
    scans; cases are persisted with scores, factors and timestamps
    (`backend/server.py`).
-   URL detection combines 14 deterministic signals including brand
    look-alike/typosquatting via Levenshtein + digit substitution,
    suspicious TLDs, IP hosts, urgency terms and threat-feed matches.
-   Screenshot analysis uses an LLM vision path for OCR, brand detection
    and clone-confidence, then combines suspicious elements and image
    fingerprints into a risk score.
-   Social scanning extracts URLs and checks scam/urgency language;
    reports expose case evidence and an investigator graph links cases
    to domains, brands, fingerprints and re-uploads.
-   Role-based Expo UI provides victim scanning/history/reports plus
    investigator/admin dashboards; repository test evidence reports
    19/19 backend cases passing in iteration 8.

## Architecture

``` mermaid
flowchart LR
    UI[Expo React Native UI] --> API[FastAPI /api]
    API --> URL[URL heuristics + threat feed]
    API --> VISION[LLM vision / explanation]
    API --> SOCIAL[Social URL + scam-language checks]
    API --> DB[(MongoDB)]
    DB --> REPORT[Reports / Graph]
    API --> REPORT
```

## Core Capability Check

  ------------------------------------------------------------------------------------------
  Capability              Status                  Evidence
  ----------------------- ----------------------- ------------------------------------------
  URL brand impersonation ✅ Verified             `backend/server.py` --- `analyze_url()`;
  / phishing detection                            `backend/tests/test_iteration_8_scan.py`

  Explainable risk        ✅ Verified             `backend/server.py` --- factors with
  scoring                                         labels/impacts; iteration-8 regression
                                                  report

  Screenshot/logo-clone   ✅ Verified             `backend/server.py` ---
  analysis                                        `/scan/screenshot`,
                                                  `vision_ocr_and_clone()`

  Social-content          🟡 Partial              `backend/server.py` --- `/scan/social`;
  detection                                       URL extraction + scam lexicon, but no
                                                  platform API ingestion

  Legitimate-use / intent 🟡 Partial              Official-host allowlisting exists; no
  distinction                                     demonstrated news/authorised-partner
                                                  classifier

  Evidence reports        ✅ Verified             `backend/server.py` --- `/reports/mine`,
                                                  `/reports/{case_id}`;
                                                  `safetap.evidence.v1`

  Related-case / offender 🟡 Partial              SHA-256 image fingerprint +
  linking                                         graph/re-upload links; no stronger
                                                  offender attribution
  ------------------------------------------------------------------------------------------

## Technical Read

**Strongest technical aspect:** The URL pipeline is unusually concrete
for an MVP: deterministic, explainable multi-signal scoring is backed by
regression tests covering both high-risk look-alikes and legitimate
domains.

**Biggest technical concern:** The ABIAE requirement is broader than
phishing detection: screenshot similarity is LLM-estimated rather than
benchmarked, social input is manual rather than collected from a real
source, and offender linking is currently exact-image re-upload
correlation rather than a multi-signal offender fingerprint.

**Core workflow:** Complete\
**Implementation confidence:** High

## Judge Metrics

  Metric               Assessment
  -------------------- ------------
  Technical Ambition   4/5
  Architecture         4/5
  Engineering          4/5
  Demo Risk            Medium

## IKIGAI Score

  Criterion                         Score
  -------------------------- ------------
  Innovation & Creativity           20/25
  Technical Implementation          25/30
  Problem Solving                   18/20
  UI/UX & Presentation               8/10
  Impact & Scalability              12/15
  **Total**                    **83/100**

## Ask the Team

1.  `vision_ocr_and_clone()` asks the LLM for a 0--100 clone confidence.
    What labelled examples or evaluation set did you use to establish
    that this score is reliable?
2.  How does the system distinguish a legitimate news article, review,
    or authorised partner from an actual impersonation when the content
    uses a real brand logo?
3.  The current re-upload link is based on an exact SHA-256 image
    fingerprint. How would you link resized/cropped/modified copies or
    cases sharing the same operator?
4.  What real or synthetic source will drive the 36-hour demo, and what
    is the expected false-positive rate on legitimate brand uses?
5.  Which parts of the risk score are calibrated from data versus
    manually assigned heuristic weights, and how would you recalibrate
    them as brands and attack patterns change?
