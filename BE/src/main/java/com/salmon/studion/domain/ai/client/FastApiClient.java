package com.salmon.studion.domain.ai.client;

import com.salmon.studion.domain.ai.dto.request.AiJobStartRequest;
import com.salmon.studion.domain.ai.dto.response.AiJobStartResponse;
import com.salmon.studion.domain.ai.dto.response.AiWorkflowStatusResponse;
import com.salmon.studion.global.common.response.ErrorCode;
import com.salmon.studion.global.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

@Component
@Slf4j
@RequiredArgsConstructor
public class FastApiClient {

    private final WebClient aiWebClient;

    public AiJobStartResponse startWorkflow(AiJobStartRequest request) {
        log.info("FastAPI workflow start 호출 | jobId={} projectId={}", request.getJobId(), request.getProjectId());
        return aiWebClient.post()
                .uri("/internal/workflow/jobs/start")
                .bodyValue(request)
                .retrieve()
                .onStatus(HttpStatusCode::isError, response ->
                        response.bodyToMono(String.class)
                                .map(body -> {
                                    log.error("FastAPI workflow start 호출 실패 | body={}", body);
                                    return new BusinessException(ErrorCode.AI_FASTAPI_CALL_FAILED);
                                }))
                .bodyToMono(AiJobStartResponse.class)
                .block();
    }

    public AiWorkflowStatusResponse getWorkflowStatus(Integer jobId) {
        log.info("FastAPI workflow status 조회 | jobId={}", jobId);
        return aiWebClient.get()
                .uri("/internal/workflow/jobs/{jobId}", jobId)
                .retrieve()
                .onStatus(HttpStatusCode::isError, response ->
                        response.bodyToMono(String.class)
                                .map(body -> {
                                    log.error("FastAPI workflow status 조회 실패 | jobId={} body={}", jobId, body);
                                    return new BusinessException(ErrorCode.AI_FASTAPI_CALL_FAILED);
                                }))
                .bodyToMono(AiWorkflowStatusResponse.class)
                .block();
    }
}
