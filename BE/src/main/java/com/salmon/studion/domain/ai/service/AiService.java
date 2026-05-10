package com.salmon.studion.domain.ai.service;

import com.salmon.studion.domain.ai.client.FastApiClient;
import com.salmon.studion.domain.ai.dto.request.AiJobStartApiRequest;
import com.salmon.studion.domain.ai.dto.request.AiJobStartRequest;
import com.salmon.studion.domain.ai.dto.request.AiUserFeedbackApiRequest;
import com.salmon.studion.domain.ai.dto.request.AiUserFeedbackRequest;
import com.salmon.studion.domain.ai.dto.response.AiJobStartResponse;
import com.salmon.studion.domain.ai.dto.response.AiWorkflowJobResponse;
import com.salmon.studion.domain.ai.dto.response.AiWorkflowStatusResponse;
import com.salmon.studion.domain.ai.entity.AiAnalysisJob;
import com.salmon.studion.domain.ai.monitor.AiJobMonitor;
import com.salmon.studion.domain.ai.repository.AiAnalysisJobRepository;
import com.salmon.studion.domain.project.service.ProjectMemberService;
import com.salmon.studion.global.common.response.ErrorCode;
import com.salmon.studion.global.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Slf4j
@RequiredArgsConstructor
public class AiService {

    private final FastApiClient fastApiClient;
    private final AiJobMonitor aiJobMonitor;
    private final AiAnalysisJobRepository aiAnalysisJobRepository;
    private final ProjectMemberService projectMemberService;

    @Transactional
    public AiJobStartResponse startWorkflow(AiJobStartApiRequest request, Integer requestedBy) {
        Integer userId = requireUserId(requestedBy);
        projectMemberService.validateProjectMember(request.getProjectId(), userId);

        AiAnalysisJob aiAnalysisJob = aiAnalysisJobRepository.save(
                AiAnalysisJob.create(request.getProjectId(), userId)
        );

        Integer jobId = aiAnalysisJob.getId();
        log.info("AiService startWorkflow 호출 | jobId={} projectId={} requestedBy={}",
                jobId, request.getProjectId(), userId);

        AiJobStartRequest fastApiRequest = AiJobStartRequest.create(jobId, request, userId);

        try {
            AiJobStartResponse response = fastApiClient.startWorkflow(fastApiRequest);
            aiAnalysisJob.markDispatched(response.getJob());
            aiJobMonitor.startMonitoring(response.getJob().getJobId(), response.getJob().getProjectId());
            return response;
        } catch (BusinessException e) {
            aiAnalysisJob.markDispatchFailed(
                    e.getErrorCode().getCode(),
                    e.getMessage()
            );
            throw e;
        } catch (RuntimeException e) {
            aiAnalysisJob.markDispatchFailed("AI_UNKNOWN", e.getMessage());
            throw e;
        }
    }

    public AiWorkflowStatusResponse getWorkflowStatus(Integer jobId, Integer requestedBy) {
        Integer userId = requireUserId(requestedBy);
        validateJobAccess(jobId, userId);

        log.info("AiService getWorkflowStatus 호출 | jobId={} requestedBy={}", jobId, userId);
        return fastApiClient.getWorkflowStatus(jobId);
    }

    public AiWorkflowJobResponse dispatchUserFeedback(
            Integer jobId,
            AiUserFeedbackApiRequest request,
            Integer requestedBy
    ) {
        Integer userId = requireUserId(requestedBy);
        AiAnalysisJob aiAnalysisJob = validateJobAccess(jobId, userId);
        validateJobProject(jobId, aiAnalysisJob.getProjectId(), request.getProjectId());

        AiUserFeedbackRequest fastApiRequest = AiUserFeedbackRequest.create(jobId, request);

        log.info("AiService dispatchUserFeedback 호출 | jobId={} projectId={} requestedBy={} decision={}",
                jobId, request.getProjectId(), userId, request.getUserDecision());
        return fastApiClient.dispatchUserFeedback(fastApiRequest);
    }

    private Integer requireUserId(Integer requestedBy) {
        if (requestedBy == null) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
        return requestedBy;
    }

    private AiAnalysisJob validateJobAccess(Integer jobId, Integer userId) {
        AiAnalysisJob aiAnalysisJob = getAiAnalysisJobOrThrow(jobId);
        projectMemberService.validateProjectMember(aiAnalysisJob.getProjectId(), userId);
        return aiAnalysisJob;
    }

    private void validateJobProject(Integer jobId, Integer expectedProjectId, Integer actualProjectId) {
        if (!expectedProjectId.equals(actualProjectId)) {
            throw new BusinessException(
                    ErrorCode.INVALID_REQUEST,
                    "jobId와 projectId가 일치하지 않습니다. jobId=" + jobId
            );
        }
    }

    private AiAnalysisJob getAiAnalysisJobOrThrow(Integer jobId) {
        return aiAnalysisJobRepository.findById(jobId)
                .orElseThrow(() -> new BusinessException(ErrorCode.AI_JOB_NOT_FOUND));
    }
}
