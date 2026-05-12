from __future__ import annotations

import json
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from app.graph.nodes import review as review_nodes
from app.graph.state import build_workflow_initial_state
from app.services.plan_critic_llm import PlanCriticLLMResponse
from app.services.workflow_snapshots import ProjectSnapshot, build_snapshot_runtime_context

FIXTURE_DIR = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "planner_critic_eval"
EQ_ACTION_TYPES = {"DYNAMIC_EQ", "EQ_CUT"}


@dataclass(frozen=True)
class CaseContext:
    dataset_id: str
    case: dict[str, Any]
    state: dict[str, Any]
    expected_case_mode: str
    expected_plan_payload: dict[str, Any] | None
    seed_bad_plan_payload: dict[str, Any] | None


@dataclass(frozen=True)
class EvalCaseResult:
    case_id: str
    title: str
    mode: str
    validator_result: str | None
    critic_result: str | None
    validator_expected: str | None
    critic_expected: str | None
    planner_match_expected: bool | None
    actual_action_type: str | None
    expected_action_type: str | None
    actual_target_track_id: int | None
    expected_target_track_id: int | None
    passed: bool
    details: str
    quality_focus: tuple[str, ...]


@dataclass(frozen=True)
class EvalSummary:
    dataset_id: str
    expected_plan_cases: int
    expected_plan_validator_passes: int
    expected_plan_critic_passes: int
    expected_plan_full_passes: int
    expected_plan_planner_matches: int
    seed_bad_plan_cases: int
    seed_bad_plan_validator_rejects: int
    seed_bad_plan_critic_rejects: int
    seed_bad_plan_full_rejects: int

    @property
    def validator_pass_rate(self) -> float:
        return 0.0 if self.expected_plan_cases == 0 else self.expected_plan_validator_passes / self.expected_plan_cases

    @property
    def critic_pass_rate(self) -> float:
        return 0.0 if self.expected_plan_cases == 0 else self.expected_plan_critic_passes / self.expected_plan_cases

    @property
    def full_pass_rate(self) -> float:
        return 0.0 if self.expected_plan_cases == 0 else self.expected_plan_full_passes / self.expected_plan_cases

    @property
    def planner_match_rate(self) -> float:
        return 0.0 if self.expected_plan_cases == 0 else self.expected_plan_planner_matches / self.expected_plan_cases

    @property
    def bad_plan_validator_recall(self) -> float:
        return 0.0 if self.seed_bad_plan_cases == 0 else self.seed_bad_plan_validator_rejects / self.seed_bad_plan_cases

    @property
    def bad_plan_critic_recall(self) -> float:
        return 0.0 if self.seed_bad_plan_cases == 0 else self.seed_bad_plan_critic_rejects / self.seed_bad_plan_cases

    @property
    def bad_plan_full_recall(self) -> float:
        return 0.0 if self.seed_bad_plan_cases == 0 else self.seed_bad_plan_full_rejects / self.seed_bad_plan_cases


CriticCallable = Callable[[CaseContext, dict[str, Any]], PlanCriticLLMResponse]


def load_dataset(dataset_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    cases_path = FIXTURE_DIR / f"{dataset_id}_cases.json"
    dataset = _load_json(cases_path)
    snapshot_path = FIXTURE_DIR / str(dataset["snapshot_file"])
    snapshot = _load_json(snapshot_path)
    return dataset, snapshot


def build_case_contexts(dataset_id: str) -> list[CaseContext]:
    dataset, snapshot_payload = load_dataset(dataset_id)
    contexts: list[CaseContext] = []
    for case in dataset["cases"]:
        state = _build_case_state(snapshot_payload=snapshot_payload, dataset=dataset, case=case)
        contexts.append(
            CaseContext(
                dataset_id=dataset_id,
                case=case,
                state=state,
                expected_case_mode=str(case.get("expected_case_mode") or "expected_plan"),
                expected_plan_payload=_build_expected_plan_payload(state, case),
                seed_bad_plan_payload=deepcopy(case.get("seed_bad_plan")),
            )
        )
    return contexts


def evaluate_dataset(dataset_id: str) -> tuple[list[EvalCaseResult], EvalSummary]:
    contexts = build_case_contexts(dataset_id)
    results: list[EvalCaseResult] = []
    for context in contexts:
        if context.expected_plan_payload is None:
            results.append(
                replay_non_plan_case(
                    context=context,
                    mode=context.expected_case_mode,
                    details="fixture policy gate",
                )
            )
        else:
            results.append(
                replay_case_with_plan(
                    context=context,
                    plan_payload=context.expected_plan_payload,
                    mode="expected_plan",
                    details="fixture expected plan",
                    critic_callable=_offline_critic_callable,
                )
            )
        if context.seed_bad_plan_payload is not None:
            results.append(
                replay_case_with_plan(
                    context=context,
                    plan_payload=context.seed_bad_plan_payload,
                    mode="seed_bad_plan",
                    details="fixture seeded bad plan",
                    critic_callable=_offline_critic_callable,
                )
            )
    return results, summarize_results(dataset_id=dataset_id, results=results)


def summarize_results(*, dataset_id: str, results: list[EvalCaseResult]) -> EvalSummary:
    expected_results = [result for result in results if result.mode == "expected_plan"]
    bad_plan_results = [result for result in results if result.mode == "seed_bad_plan"]
    return EvalSummary(
        dataset_id=dataset_id,
        expected_plan_cases=len(expected_results),
        expected_plan_validator_passes=sum(1 for result in expected_results if result.validator_result == "PASS"),
        expected_plan_critic_passes=sum(1 for result in expected_results if result.critic_result == "PASS"),
        expected_plan_full_passes=sum(
            1
            for result in expected_results
            if result.validator_result == "PASS" and result.critic_result == "PASS"
        ),
        expected_plan_planner_matches=sum(1 for result in expected_results if result.planner_match_expected is True),
        seed_bad_plan_cases=len(bad_plan_results),
        seed_bad_plan_validator_rejects=sum(1 for result in bad_plan_results if result.validator_result == "REJECT"),
        seed_bad_plan_critic_rejects=sum(1 for result in bad_plan_results if result.critic_result == "REJECT"),
        seed_bad_plan_full_rejects=sum(
            1
            for result in bad_plan_results
            if result.validator_result == "REJECT" and result.critic_result == "REJECT"
        ),
    )


def replay_non_plan_case(
    *,
    context: CaseContext,
    mode: str,
    details: str,
) -> EvalCaseResult:
    region = _find_region(context.state)
    issue_type = str(region.get("issue_type") or "")
    passed = False
    if mode == "warning_only":
        passed = issue_type == "master_clipping" and context.expected_plan_payload is None
    elif mode == "no_plan_expected":
        passed = issue_type == "track_clipping" and context.expected_plan_payload is None

    return EvalCaseResult(
        case_id=str(context.case["case_id"]),
        title=str(context.case["title"]),
        mode=mode,
        validator_result=None,
        critic_result=None,
        validator_expected=None,
        critic_expected=None,
        planner_match_expected=None,
        actual_action_type=None,
        expected_action_type=None,
        actual_target_track_id=None,
        expected_target_track_id=None,
        passed=passed,
        details=f"{details}; issue={issue_type}; no EQ recipe expected",
        quality_focus=tuple(str(item) for item in context.case.get("quality_focus", [])),
    )


def replay_case_with_plan(
    *,
    context: CaseContext,
    plan_payload: dict[str, Any],
    mode: str,
    details: str,
    critic_callable: CriticCallable,
) -> EvalCaseResult:
    case = context.case
    state_with_plan = {**context.state, "plan_payload": deepcopy(plan_payload)}
    validator_delta = review_nodes.plan_rule_validator(state_with_plan)
    validator_state = {**state_with_plan, **validator_delta}

    if validator_state.get("validator_result") == "REJECT":
        critic_result = "REJECT"
        critic_note = "validator rejected before critic"
    else:
        critic_response = critic_callable(context, deepcopy(plan_payload))
        critic_result = critic_response.result
        critic_note = critic_response.note

    expected_review = case["expected_seed_review"] if mode == "seed_bad_plan" else case["expected_review"]
    action = ((plan_payload.get("candidate") or {}).get("action") or {})
    expected_plan = case.get("expected_plan") or {}
    planner_match_expected = None
    if mode == "expected_plan":
        planner_match_expected = (
            str(action.get("actionType")) == str(expected_plan["action_type"])
            and str(action.get("targetScope")) == "TRACK"
            and int(action.get("targetTrackId") or 0) == int(expected_plan["target_track_id"])
            and action.get("targetClipId") == expected_plan["target_clip_id"]
        )

    passed = (
        validator_state.get("validator_result") == str(expected_review["validator"])
        and critic_result == str(expected_review["critic"])
        and (planner_match_expected is not False)
    )
    return EvalCaseResult(
        case_id=str(case["case_id"]),
        title=str(case["title"]),
        mode=mode,
        validator_result=validator_state.get("validator_result"),
        critic_result=critic_result,
        validator_expected=str(expected_review["validator"]),
        critic_expected=str(expected_review["critic"]),
        planner_match_expected=planner_match_expected,
        actual_action_type=str(action.get("actionType")) if action.get("actionType") is not None else None,
        expected_action_type=str(expected_plan.get("action_type")) if mode == "expected_plan" else None,
        actual_target_track_id=int(action.get("targetTrackId")) if action.get("targetTrackId") is not None else None,
        expected_target_track_id=int(expected_plan["target_track_id"]) if mode == "expected_plan" else None,
        passed=passed,
        details=f"{details}; {critic_note}".strip("; "),
        quality_focus=tuple(str(item) for item in case.get("quality_focus", [])),
    )


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _find_region(state: dict[str, Any]) -> dict[str, Any]:
    selected_region_id = int(state["selected_region_id"])
    return next(region for region in state["analysis_regions"] if int(region["id"]) == selected_region_id)


def _resolve_preserve_track_id(state: dict[str, Any]) -> int | None:
    preserve_clip_id = state.get("preserve_clip_id")
    if preserve_clip_id is None:
        return None
    for clip in state.get("clip_index", []):
        if int(clip.get("clip_id") or 0) == int(preserve_clip_id):
            return int(clip["track_id"])
    return None


def _build_case_state(
    *,
    snapshot_payload: dict[str, Any],
    dataset: dict[str, Any],
    case: dict[str, Any],
) -> dict[str, Any]:
    snapshot = ProjectSnapshot.model_validate(snapshot_payload)
    context = build_snapshot_runtime_context(snapshot)
    analysis_regions = deepcopy(dataset["analysis_regions"])
    ranking_scores = {int(region["id"]): float(region.get("ranking_score") or 0.0) for region in analysis_regions}
    ranked_candidate_ids = [
        region_id for region_id, _score in sorted(ranking_scores.items(), key=lambda item: (-item[1], item[0]))
    ]
    issue_types = case.get("issue_types")
    if issue_types is None:
        issue_types = sorted({str(region.get("issue_type")) for region in analysis_regions if region.get("issue_type")})

    preserve_clip_id = case.get("preserve_clip_id")
    return build_workflow_initial_state(
        job_id=990001,
        project_id=880001,
        project_duration_ms=context.duration_ms,
        bpm=context.bpm,
        numerator=context.numerator,
        denominator=context.denominator,
        bar_mapping=deepcopy(context.bar_mapping),
        clip_index=deepcopy(context.clip_index),
        track_ids=deepcopy(context.track_ids),
        issue_types=issue_types,
        analysis_regions=analysis_regions,
        analysis_region_ids=[int(region["id"]) for region in analysis_regions],
        ranked_candidate_ids=ranked_candidate_ids,
        ranking_scores=ranking_scores,
        selected_region_id=int(case["selected_region_id"]),
        preserve_clip_id=int(preserve_clip_id) if preserve_clip_id is not None else None,
        user_feedback_message=case.get("user_feedback_message"),
        plan_revision_notes=deepcopy(case.get("revision_notes", [])),
    )


def _plan_gain_for_rule(rule: str) -> float:
    if rule == "conservative_cut":
        return -1.6
    if rule == "light_cut":
        return -1.2
    if rule == "track_clipping_eq_cut":
        return -1.8
    return -2.4


def _resolve_band_range(region: dict[str, Any], expected: dict[str, Any]) -> tuple[int | None, int | None]:
    band_rule = str(expected.get("band_rule") or "region_band")
    band_low_hz = region.get("band_low_hz")
    band_high_hz = region.get("band_high_hz")
    if band_rule == "track_clipping_high":
        return 4500, 9000
    if band_rule == "track_clipping_low_mid":
        return 180, 1200
    if band_low_hz is None or band_high_hz is None:
        return None, None

    low_hz = int(band_low_hz)
    high_hz = int(band_high_hz)
    if band_rule == "inside_region_band" and high_hz - low_hz > 120:
        low_hz += 20
        high_hz -= 20
    return low_hz, high_hz


def _build_expected_plan_payload(state: dict[str, Any], case: dict[str, Any]) -> dict[str, Any] | None:
    expected = case.get("expected_plan")
    if not isinstance(expected, dict):
        return None

    region = _find_region(state)
    start_ms = int(region["start_ms"])
    end_ms = int(region["end_ms"])
    if expected["time_range_rule"] == "tighter_inside_region":
        start_ms += 80
        end_ms -= 80

    band_low_hz, band_high_hz = _resolve_band_range(region, expected)

    action: dict[str, Any] = {
        "actionType": expected["action_type"],
        "targetScope": "TRACK",
        "targetTrackId": int(expected["target_track_id"]),
        "targetClipId": expected["target_clip_id"],
        "startMs": start_ms,
        "endMs": end_ms,
        "gainDeltaDb": _plan_gain_for_rule(str(expected["gain_rule"])),
        "params": {"threshold": -19, "ratio": 2.0, "q": 1.1},
    }
    if band_low_hz is not None and band_high_hz is not None:
        action["bandLowHz"] = band_low_hz
        action["bandHighHz"] = band_high_hz

    return {
        "strategyTitle": f"{case['case_id']} strategy",
        "strategySummary": f"{case['title']} summary",
        "summary": f"{case['title']} candidate",
        "explanation": f"{case['title']} explanation",
        "selectedRegionId": int(case["selected_region_id"]),
        "preserveClipId": case.get("preserve_clip_id"),
        "userFeedbackMessage": case.get("user_feedback_message"),
        "candidate": {
            "candidateId": f"{case['case_id']}-candidate-1",
            "action": action,
        },
    }


def _offline_critic_callable(context: CaseContext, plan_payload: dict[str, Any]) -> PlanCriticLLMResponse:
    return _offline_critic_decision(case=context.case, state=context.state, plan_payload=plan_payload)


def _collect_track_clipping_band_hints(region: dict[str, Any]) -> set[str]:
    hints: set[str] = set()
    for hint in region.get("band_hints", []) or []:
        hints.add(str(hint))
    contributor_hints = region.get("contributor_band_hints", {})
    track_id = region.get("track_id")
    if track_id is not None and str(track_id) in contributor_hints:
        hints.update(str(hint) for hint in contributor_hints[str(track_id)])
    if track_id in contributor_hints:
        hints.update(str(hint) for hint in contributor_hints[track_id])
    return hints


def _offline_critic_decision(
    *,
    case: dict[str, Any],
    state: dict[str, Any],
    plan_payload: dict[str, Any],
) -> PlanCriticLLMResponse:
    region = _find_region(state)
    action = ((plan_payload.get("candidate") or {}).get("action") or {})
    preserve_track_id = _resolve_preserve_track_id(state)
    violations: list[str] = []

    for rule in case.get("must_not", []):
        if rule == "preserve_track_edit":
            if preserve_track_id is not None and int(action.get("targetTrackId") or 0) == preserve_track_id:
                violations.append("plan edits the preserved track")
        elif rule == "master_scope":
            if str(action.get("targetScope")) == "MASTER":
                violations.append("plan uses MASTER scope")
        elif rule == "broadband_master_fix":
            if str(action.get("targetScope")) == "MASTER":
                violations.append("plan falls back to a broadband master fix")
        elif rule == "non_eq_action":
            if str(action.get("actionType") or "") not in EQ_ACTION_TYPES:
                violations.append("plan uses a non-EQ action")
        elif rule == "target_clip_id_equals_preserve_clip_id":
            if action.get("targetClipId") is not None and int(action["targetClipId"]) == int(state["preserve_clip_id"]):
                violations.append("target clip matches the preserved clip")
        elif rule == "over_cut_more_than_6db":
            if abs(float(action.get("gainDeltaDb") or 0.0)) > 6.0:
                violations.append("gain reduction exceeds 6 dB")
        elif rule == "time_range_expands_beyond_region":
            if int(action.get("startMs") or 0) < int(region["start_ms"]) or int(action.get("endMs") or 0) > int(region["end_ms"]):
                violations.append("time range extends beyond the selected region")
        elif rule == "unsupported_track_clipping_hint":
            band_hints = _collect_track_clipping_band_hints(region)
            if "high" not in band_hints and "low_mid" not in band_hints:
                violations.append("track_clipping case has no supported EQ hint")
        elif rule.startswith("target_track_id_"):
            forbidden_track_id = int(rule.rsplit("_", maxsplit=1)[-1])
            if int(action.get("targetTrackId") or 0) == forbidden_track_id:
                violations.append(f"plan targets forbidden track {forbidden_track_id}")
        elif rule.startswith("first_choice_target_track_id_"):
            forbidden_track_id = int(rule.rsplit("_", maxsplit=1)[-1])
            if int(action.get("targetTrackId") or 0) == forbidden_track_id:
                violations.append(f"plan picks deprioritized track {forbidden_track_id} first")

    if violations:
        return PlanCriticLLMResponse(result="REJECT", note="; ".join(violations))
    return PlanCriticLLMResponse(result="PASS", note="offline critic pass")
