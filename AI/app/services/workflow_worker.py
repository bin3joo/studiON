from __future__ import annotations

import logging

from app.graph.workflow import run_workflow_graph
from app.services.workflow_jobs import WorkflowDispatchMessage, get_workflow_job_store

logger = logging.getLogger(__name__)


def run_workflow_dispatch(message: WorkflowDispatchMessage):
    store = get_workflow_job_store()
    logger.info(
        "워크플로 작업 소비 시작: job_id=%s dispatch_type=%s",
        message.job_id,
        message.dispatch_type,
    )
    result = run_workflow_graph(
        {
            "job_id": message.job_id,
            "project_id": message.project_id,
            "dispatch_type": message.dispatch_type,
            "requested_by": message.requested_by,
            "main_track_id": message.main_track_id,
            "selected_action_ids": message.selected_action_ids,
            "user_decision": message.user_decision,
        }
    )
    store.save_graph_state(result)
    logger.info(
        "워크플로 작업 소비 완료: job_id=%s phase=%s durable_status=%s",
        message.job_id,
        result.get("phase"),
        result.get("durable_status"),
    )
    return result
