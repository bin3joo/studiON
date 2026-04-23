# 2026-04-23 Workflow Refactor

## Summary
- Refactored the AI workflow into a single LangGraph-centered flow.
- Added a required user interrupt for selecting the main track after `candidate_ranking`.
- Simplified the MVP preview loop to a single representative solution by removing the reselect path from `wait_user_confirm`.

## Scope
- Unified workflow graph structure
- State / edge / node updates
- Projection and API input updates needed for the new flow
- Tests, docs, and graph PNG regeneration

## Implemented Changes
### Graph Structure
- Consolidated runtime/apply concepts into a unified workflow graph.
- Added `wait_user_mix_intent` and `resume_after_mix_intent`.
- Routed `candidate_ranking` to user mix-intent waiting before suggestion generation.
- Kept `wait_user_selection` for accepting the generated single solution.
- Kept `wait_user_confirm` for preview confirmation.
- Removed the `reselect -> wait_user_selection` loop from preview confirmation.

### State and Routing
- Added `main_track_id` to workflow state.
- Updated entry routing so the graph can:
  - start from `init_state`
  - resume from `waiting_for_user_mix_intent`
  - resume from `waiting_for_user_selection`
  - resume from `waiting_for_user_confirm`
- Reduced `UserDecision` to `confirm`, `retry`, and `cancel`.

### Node Behavior
- `wait_user_mix_intent` now represents the required user choice of main track.
- `resume_after_mix_intent` validates the chosen main track and resumes the flow.
- `generate_suggestions` now prefers `main_track_id` as the target track for generated actions.
- `apply_selected_edit_recipe` remains the validation/apply-prep step before preview rendering.

### API / Projection Changes
- Added `main_track_id` to workflow/apply request handling where needed.
- Updated workflow summary terminal nodes to include `wait_user_mix_intent`.
- Kept projections aligned with the unified workflow response shape.

### Visualization and Docs
- Regenerated the unified workflow PNG as `AI/workflow-graph.png`.
- Updated `AI/docs/langgraph-flow.md` to reflect:
  - main track selection wait
  - single-solution MVP flow
  - no reselect loop at preview confirmation

## Files Touched
- `AI/app/graph/state.py`
- `AI/app/graph/edges.py`
- `AI/app/graph/nodes.py`
- `AI/app/graph/workflow.py`
- `AI/app/api/v1/endpoints.py`
- `AI/tests/test_workflow.py`
- `AI/docs/langgraph-flow.md`
- `AI/workflow-graph.png`

## Validation
- `pytest AI/tests/test_workflow.py`
- `ruff check AI/app AI/tests`

## Resulting Flow
1. Analyze project and rank candidates.
2. Stop at `wait_user_mix_intent`.
3. Resume with `main_track_id`.
4. Generate one representative solution.
5. Stop at `wait_user_selection`.
6. Resume with selected action.
7. Render preview and stop at `wait_user_confirm`.
8. Confirm, retry preview, or cancel.
9. Finalize output.

## Follow-up Notes
- Node timing persistence table is still only a design discussion and has not been implemented.
- Real LLM/service/repository wiring is still pending; current nodes remain orchestration-focused.
