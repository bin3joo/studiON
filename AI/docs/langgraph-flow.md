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
17. planning agent
18. plan rule validation
19. plan critic
20. plan approval
21. execution plan materialization
22. sibilance auto-fix and logging
23. analysis persistence
24. user action gate
25. single-action auto select or user selection wait
26. selected recipe apply
27. preview render
28. user confirm wait
29. commit or cancel path
30. feedback event emission
31. finalize output

## Flow Rules
- The graph ends in one of five stable states: waiting for plan input, waiting for selection, waiting for confirmation, completed, failed.
- `POST /workflow/jobs/start` accepts the full project snapshot and persists it before worker dispatch. Frontend polling uses `GET /workflow/jobs/{job_id}` as the single lookup API.
- `load_project_snapshot` restores only the persisted snapshot reference plus derived BPM and clip metadata needed for later projection.
- `sample_track_clips` selects one resolvable source clip per track and records the original audio file path used for CLAP role inference.
- `cheap_dsp_scan` restores every clip on the project timeline, resolves clip audio through `audio_path`, direct `objectKey`, or `audio_root/objectKey`, and may enrich clip metadata from `audio_metadata.objectKey` when only `audio_metadata_id` is present.
- `cheap_dsp_scan` runs full STFT over the reconstructed track timelines, stores frame-level summaries behind MongoDB artifact references, and keeps only compact summary plus artifact id in runtime state.
- unresolved audio paths are a workflow failure, not a mock fallback path.
- `detect_band_overlap` now detects congested low-mid time regions first, then attaches the involved track ids and overlapping clip ids for that region before user plan input.
- `detect_clipping` uses oversampled `true_peak_dbfs` as the primary clipping signal, then uses sample-peak proximity and `clip_ratio` only as severity helpers.
- `detect_clipping` and `detect_sibilance` create one or more analysis regions with ms range, measure range, affected clip ids, target track metadata, severity, and evidence references.
- `select_role_candidates` picks only high-band problem candidate tracks for `sibilance` role inference. It first reuses `high_band_harshness` regions when present, then falls back to the same high-band window thresholds on DSP frame summaries.
- `infer_track_roles` now sends one original audio file per candidate track to the external CLAP inference service instead of slicing multiple excerpts from the track timeline.
- `detect_sibilance` trusts `infer_track_roles` results as the single role-aware input path. It only scans tracks labeled `vocal-like`, and if CLAP is skipped the node returns no sibilance regions instead of falling back to DSP-only heuristics.
- If CLAP inference fails, returns incomplete track predictions, or cannot build excerpts, the workflow fails explicitly. DSP fallback is not allowed on this path.
- CLAP raw response details stay in a MongoDB artifact document, while runtime state keeps only role labels, score/confidence summaries, and artifact references.
- `merge_analysis` is a final region stabilization step. It removes duplicate regions only when issue type, track targeting, band range, and time span are identical, keeps the highest-score copy, then recomputes `detected_issues` and `analysis_region_ids`.
- `merge_analysis` sorts the stabilized list by `start_ms`, `issue_type`, and descending detector `score` so later nodes see a deterministic region order.
- `candidate_ranking` computes `ranking_scores` for every final region, but only regions with `requires_user_action == true` become `ranked_candidate_ids`.
- `candidate_ranking` prioritizes user-facing issues by issue type, severity, detector score, and duration. The current default order is `clipping`, `band_overlap`, then `high_band_harshness`.
- `clipping` stays on the user plan input path and materializes user-facing suggestion and preview actions.
- `sibilance` skips plan input, generates deterministic de-esser recipes, and closes without preview.
- `planning_agent`, `plan_rule_validator`, and `plan_critic` form the current plan loop.
- `planning_agent` is now the source of truth for the executable draft plan. It reads the selected region, preserve clip, and user intent, then calls the GMS OpenAI-compatible Chat Completions endpoint with `gpt-5.2` to generate a single executable `plan_payload`.
- `plan_rule_validator` is the rule-based safety gate. It checks action schema, issue-to-action compatibility, scope rules, selected-region bounds, and preserve-target conflicts before the plan can reach the critic.
- `plan_critic` uses a separate Anthropic-compatible GMS endpoint with `claude-sonnet-4-5-20250929` to perform semantic review and can return `PASS`, `REVISE`, or `REJECT`.
- Planning or critic endpoint failures are explicit workflow failures. There is no deterministic plan fallback on this path.
- validator and critic can force regeneration of the plan.
- If the approved suggestion payload contains exactly one preview action, `user_action_gate` auto-fills `selected_action_ids` and skips `wait_user_selection`.
- If multiple preview actions are introduced later, the existing `wait_user_selection -> resume_selection` path remains the selection source of truth.
- The MVP exposes a single representative solution, so there is no preview-time reselect loop back to suggestion selection.
- user-facing preview and confirmation are part of the graph, not a separate apply graph.

## Storage Rules
- Redis is only for live runtime projection and is not the source of truth.
- MySQL remains the durable lifecycle and result source of truth.
- MongoDB stores evidence, snapshot, and artifact documents by reference only.

## Follow-up
- After the single-graph implementation stabilizes, create a 2-graph split variant and compare latency, operational complexity, and recoverability against the unified graph.
