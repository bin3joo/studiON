package com.salmon.studion.domain.project.controller;

import com.salmon.studion.domain.project.dto.request.ProjectCreateRequest;
import com.salmon.studion.domain.project.dto.response.ProjectCreateResponse;
import com.salmon.studion.domain.project.facade.ProjectFacade;
import com.salmon.studion.global.auth.CustomOAuth2User;
import com.salmon.studion.global.common.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/projects")
@RequiredArgsConstructor
public class ProjectController {

    private final ProjectFacade projectFacade;

    @PostMapping()
    public ResponseEntity<ApiResponse<ProjectCreateResponse>> createProject(
            @RequestBody @Valid ProjectCreateRequest projectCreateRequest
//            ,@AuthenticationPrincipal CustomOAuth2User user
    ) {
        // TODO: OAuth 구현 후 교체 예정
        Integer userId = 1;
//        Integer userId = user.getUserId();
        return ResponseEntity.ok(ApiResponse.success(projectFacade.createProject(projectCreateRequest, userId)));
    }
}
