# LangGraph Flow Rules

## Overview
The AI workflow now uses a single LangGraph that covers analysis, plan input collection, plan loop execution, preview rendering, and user confirmation. FastAPI request creation and Dramatiq worker scheduling remain outside the graph.

## Unified Workflow
The workflow graph follows this product-oriented order:

1. entry context load
2. state initialization
3. project snapshot load
4. track clip sampling
5. cheap DSP scan
6. band overlap detection
7. clipping detection
8. high-band harshness detection
9. role candidate selection
10. CLAP gate
11. track role inference when needed
12. sibilance detection
13. merged analysis
14. candidate ranking
15. plan input wait
16. plan input resume
17. rule candidate build
18. planning agent
19. plan rule validation
20. plan critic
21. plan approval
22. execution plan materialization
23. clipping auto-fix and logging
24. analysis persistence
25. user action gate
26. user selection wait
27. selected recipe apply
28. preview render
29. user confirm wait
30. commit or cancel path
31. feedback event emission
32. finalize output

## Flow Rules
- The graph ends in one of five stable states: waiting for plan input, waiting for selection, waiting for confirmation, completed, failed.
- `POST /workflow/jobs/start` accepts the full project snapshot and persists it before worker dispatch. Frontend polling uses `GET /workflow/jobs/{job_id}` as the single lookup API.
- `load_project_snapshot` restores only the persisted snapshot reference plus derived BPM and clip metadata needed for later projection.
- `cheap_dsp_scan` restores every clip on the project timeline, resolves clip audio through `audio_path`, direct `objectKey`, or `audio_root/objectKey`, and may enrich clip metadata from `audio_metadata.objectKey` when only `audio_metadata_id` is present.
- `cheap_dsp_scan` runs full STFT over the reconstructed track timelines, stores frame-level summaries behind MongoDB artifact references, and keeps only compact summary plus artifact id in runtime state.
- unresolved audio paths are a workflow failure, not a mock fallback path.
- `detect_band_overlap` now detects congested low-mid time regions first, then attaches the involved track ids and overlapping clip ids for that region before user plan input.
- `detect_clipping` and `detect_sibilance` create one or more analysis regions with ms range, measure range, affected clip ids, target track metadata, severity, and evidence references.
- `clipping` keeps a deterministic auto-fix branch and also participates in persisted analysis results.
- `band_overlap` stays on the user plan input path, while `sibilance` skips plan input and enters the automatic planning path directly.
- `build_rule_candidates`, `planning_agent`, `plan_rule_validator`, and `plan_critic` form the current plan loop. The graph shape is agent-like, but the planner and critic internals are still deterministic rule-based implementations.
- validator and critic can force regeneration of the plan.
- The MVP exposes a single representative solution, so there is no preview-time reselect loop back to suggestion selection.
- user-facing preview and confirmation are part of the graph, not a separate apply graph.

## Storage Rules
- Redis is only for live runtime projection and is not the source of truth.
- MySQL remains the durable lifecycle and result source of truth.
- MongoDB stores evidence, snapshot, and artifact documents by reference only.

## Follow-up
- After the single-graph implementation stabilizes, create a 2-graph split variant and compare latency, operational complexity, and recoverability against the unified graph.
