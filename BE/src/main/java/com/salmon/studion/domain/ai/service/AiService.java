package com.salmon.studion.domain.ai.service;

import com.salmon.studion.domain.ai.client.FastApiClient;
import com.salmon.studion.domain.ai.dto.request.AiJobStartRequest;
import com.salmon.studion.domain.ai.dto.response.AiJobStartResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AiService {

    private final FastApiClient fastApiClient;

    public AiJobStartResponse startWorkflow(AiJobStartRequest request) {
        return fastApiClient.startWorkflow(request);
    }
}
