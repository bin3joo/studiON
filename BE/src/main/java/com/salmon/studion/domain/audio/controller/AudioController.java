package com.salmon.studion.domain.audio.controller;

import com.salmon.studion.domain.audio.dto.request.AudioUploadUrlRequest;
import com.salmon.studion.domain.audio.dto.response.AudioUploadUrlResponse;
import com.salmon.studion.domain.audio.facade.AudioFacade;
import com.salmon.studion.global.auth.CustomOAuth2User;
import com.salmon.studion.global.common.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/audios")
@RequiredArgsConstructor
public class AudioController {

    private final AudioFacade audioFacade;

    @PostMapping("/upload-url")
    public ResponseEntity<ApiResponse<AudioUploadUrlResponse>> getAudioUploadUrl(
            @Valid @RequestBody AudioUploadUrlRequest audioUploadUrlRequest,
            @AuthenticationPrincipal CustomOAuth2User user
    ) {
        return ResponseEntity.ok(ApiResponse.success(audioFacade.getAudioUploadUrl(audioUploadUrlRequest, user.getUserId())));
    }
}
