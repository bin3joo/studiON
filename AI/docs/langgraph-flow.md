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
23. sibilance auto-fix and logging
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
- `sample_track_clips` no longer picks a single representative clip id per track. It now builds per-track representative sample specs by selecting a small set of longer clips and excerpt ranges under a fixed duration budget.
- `cheap_dsp_scan` restores every clip on the project timeline, resolves clip audio through `audio_path`, direct `objectKey`, or `audio_root/objectKey`, and may enrich clip metadata from `audio_metadata.objectKey` when only `audio_metadata_id` is present.
- `cheap_dsp_scan` runs full STFT over the reconstructed track timelines, stores frame-level summaries behind MongoDB artifact references, and keeps only compact summary plus artifact id in runtime state.
- unresolved audio paths are a workflow failure, not a mock fallback path.
- `detect_band_overlap` now detects congested low-mid time regions first, then attaches the involved track ids and overlapping clip ids for that region before user plan input.
- `detect_clipping` uses oversampled `true_peak_dbfs` as the primary clipping signal, then uses sample-peak proximity and `clip_ratio` only as severity helpers.
- `detect_clipping` and `detect_sibilance` create one or more analysis regions with ms range, measure range, affected clip ids, target track metadata, severity, and evidence references.
- `select_role_candidates` uses cheap DSP `vocal_like_score` as a threshold-based prefilter with a capped candidate count instead of the old fixed top-2 rule.
- `infer_track_roles` now builds WAV excerpts from each candidate track's representative sample spec and sends them to an external CLAP inference service.
- If CLAP inference fails, returns incomplete track predictions, or cannot build excerpts, the workflow fails explicitly. DSP fallback is not allowed on this path.
- CLAP raw response details stay in a MongoDB artifact document, while runtime state keeps only role labels, score/confidence summaries, and artifact references.
- `clipping` stays on the user plan input path and materializes user-facing suggestion and preview actions.
- `sibilance` skips plan input, generates deterministic de-esser recipes, and closes without preview.
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
