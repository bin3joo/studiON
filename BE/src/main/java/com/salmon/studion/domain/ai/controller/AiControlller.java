package com.salmon.studion.domain.ai.controller;

import com.salmon.studion.domain.ai.dto.request.AiJobStartRequest;
import com.salmon.studion.domain.ai.dto.response.AiJobStartResponse;
import com.salmon.studion.domain.ai.service.AiService;
import com.salmon.studion.global.common.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/ai")
public class AiControlller {

    private final AiService aiService;

    @PostMapping("/workflow/jobs/start")
    public ResponseEntity<ApiResponse<AiJobStartResponse>> startWorkflow(
            @Valid @RequestBody AiJobStartRequest request
    ){
        return ResponseEntity.ok(ApiResponse.success(aiService.startWorkflow(request)));
    }
}
