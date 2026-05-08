package com.salmon.studion.domain.ai.client;

import com.salmon.studion.domain.ai.dto.request.AiJobStartRequest;
import com.salmon.studion.domain.ai.dto.response.AiJobStartResponse;
import com.salmon.studion.global.common.response.ErrorCode;
import com.salmon.studion.global.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

@Component
@RequiredArgsConstructor
public class FastApiClient {

    private final WebClient aiWebClient;

    public AiJobStartResponse startWorkflow(AiJobStartRequest request) {
        return aiWebClient.post()
                .uri("/internal/workflow/jobs/start")
                .bodyValue(request)
                .retrieve()
                .onStatus(HttpStatusCode::isError, response ->
                        response.bodyToMono(String.class)
                                .map(body -> new BusinessException(ErrorCode.AI_FASTAPI_CALL_FAILED)))
                .bodyToMono(AiJobStartResponse.class)
                .block();
    }
}
