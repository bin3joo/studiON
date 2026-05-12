from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from scripts.planner_critic_eval_support import EvalCaseResult, EvalSummary, evaluate_dataset


def _percent(value: float) -> str:
    return f"{value * 100:.1f}%"


def _mode_label(mode: str) -> str:
    labels = {
        "expected_plan": "expected_plan",
        "seed_bad_plan": "seed_bad_plan",
        "no_plan_expected": "no_plan",
        "warning_only": "warning_only",
    }
    return labels.get(mode, mode)


def _truncate(text: str, width: int) -> str:
    if len(text) <= width:
        return text
    if width <= 3:
        return text[:width]
    return text[: width - 3] + "..."


def _display(value: str | None) -> str:
    return value if value not in {None, ""} else "-"


def _format_result_row(result: EvalCaseResult) -> list[str]:
    status = "PASS" if result.passed else "FAIL"
    planner_match = "-"
    if result.planner_match_expected is True:
        planner_match = "match"
    elif result.planner_match_expected is False:
        planner_match = "mismatch"
    return [
        result.case_id,
        _mode_label(result.mode),
        status,
        planner_match,
        f"{_display(result.validator_result)}/{_display(result.validator_expected)}",
        f"{_display(result.critic_result)}/{_display(result.critic_expected)}",
        _truncate(
            f"{result.actual_action_type or '-'}->{result.actual_target_track_id if result.actual_target_track_id is not None else '-'}",
            16,
        ),
        _truncate(result.title, 42),
        _truncate(", ".join(result.quality_focus), 34),
        _truncate(result.details, 48),
    ]


def render_summary_text(summary: EvalSummary) -> str:
    lines = [
        f"dataset: {summary.dataset_id}",
        "",
        "summary",
        f"- expected plan cases: {summary.expected_plan_cases}",
        f"- validator passes: {summary.expected_plan_validator_passes}/{summary.expected_plan_cases} ({_percent(summary.validator_pass_rate)})",
        f"- critic passes: {summary.expected_plan_critic_passes}/{summary.expected_plan_cases} ({_percent(summary.critic_pass_rate)})",
        f"- full passes: {summary.expected_plan_full_passes}/{summary.expected_plan_cases} ({_percent(summary.full_pass_rate)})",
        f"- planner matches: {summary.expected_plan_planner_matches}/{summary.expected_plan_cases} ({_percent(summary.planner_match_rate)})",
        f"- bad-plan validator rejects: {summary.seed_bad_plan_validator_rejects}/{summary.seed_bad_plan_cases} ({_percent(summary.bad_plan_validator_recall)})",
        f"- bad-plan critic rejects: {summary.seed_bad_plan_critic_rejects}/{summary.seed_bad_plan_cases} ({_percent(summary.bad_plan_critic_recall)})",
        f"- bad-plan full rejects: {summary.seed_bad_plan_full_rejects}/{summary.seed_bad_plan_cases} ({_percent(summary.bad_plan_full_recall)})",
    ]
    return "\n".join(lines)


def render_case_table(results: list[EvalCaseResult]) -> str:
    headers = ["case", "mode", "status", "planner", "validator", "critic", "action", "title", "focus", "details"]
    rows = [_format_result_row(result) for result in results]
    widths = [
        max(len(header), *(len(row[index]) for row in rows))
        for index, header in enumerate(headers)
    ]

    def render_row(columns: list[str]) -> str:
        return " | ".join(column.ljust(widths[index]) for index, column in enumerate(columns))

    divider = "-+-".join("-" * width for width in widths)
    lines = ["", "results", render_row(headers), divider]
    for row in rows:
        lines.append(render_row(row))
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Render the offline planner/critic fixture evaluation report.")
    parser.add_argument(
        "--dataset",
        default="p1_dual_vocal_bed",
        help="Fixture dataset ID without the `_cases.json` suffix.",
    )
    args = parser.parse_args()

    results, summary = evaluate_dataset(args.dataset)
    print(render_summary_text(summary))
    print(render_case_table(results))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
