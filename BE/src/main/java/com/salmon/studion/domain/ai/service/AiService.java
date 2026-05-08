package com.salmon.studion.domain.ai.service;

import com.salmon.studion.domain.ai.client.FastApiClient;
import com.salmon.studion.domain.ai.dto.request.AiJobStartApiRequest;
import com.salmon.studion.domain.ai.dto.request.AiJobStartRequest;
import com.salmon.studion.domain.ai.dto.response.AiJobStartResponse;
import com.salmon.studion.domain.ai.dto.response.AiWorkflowStatusResponse;
import com.salmon.studion.domain.ai.monitor.AiJobMonitor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Service
@Slf4j
@RequiredArgsConstructor
public class AiService {

    private final FastApiClient fastApiClient;
    private final AiJobMonitor aiJobMonitor;
    private final AiJobIdGenerator aiJobIdGenerator;

    public AiJobStartResponse startWorkflow(AiJobStartApiRequest request, Integer requestedBy) {
        Integer jobId = aiJobIdGenerator.nextId();
        log.info("AiService startWorkflow 진입 | generatedJobId={} projectId={} requestedBy={}",
                jobId, request.getProjectId(), requestedBy);

        AiJobStartRequest fastApiRequest = new AiJobStartRequest();
        fastApiRequest.setJobId(jobId);
        fastApiRequest.setProjectId(request.getProjectId());
        fastApiRequest.setRequestedBy(requestedBy);
        fastApiRequest.setIssueTypes(request.getIssueTypes());
        fastApiRequest.setValidatorMode(request.getValidatorMode());
        fastApiRequest.setCriticMode(request.getCriticMode());
        fastApiRequest.setProjectSnapshotRequest(request.getProjectSnapshot());

        AiJobStartResponse response = fastApiClient.startWorkflow(fastApiRequest);
        aiJobMonitor.startMonitoring(response.getJob().getJobId(), response.getJob().getProjectId());
        return response;
    }

    public AiWorkflowStatusResponse getWorkflowStatus(Integer jobId) {
        log.info("AiService getWorkflowStatus 진입 | jobId={}", jobId);
        return fastApiClient.getWorkflowStatus(jobId);
    }
}
