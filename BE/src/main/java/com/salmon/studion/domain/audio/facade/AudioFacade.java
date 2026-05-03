package com.salmon.studion.domain.audio.facade;

import com.salmon.studion.domain.audio.dto.request.AudioMetadataCreateRequest;
import com.salmon.studion.domain.audio.dto.request.AudioUploadUrlRequest;
import com.salmon.studion.domain.audio.dto.response.AudioMetadataCreateResponse;
import com.salmon.studion.domain.audio.dto.response.AudioUploadUrlResponse;
import com.salmon.studion.domain.audio.entity.AudioMetadata;
import com.salmon.studion.domain.audio.service.AudioService;
import com.salmon.studion.domain.project.service.ProjectMemberService;
import com.salmon.studion.global.infrastructure.s3.S3StorageService;
import com.salmon.studion.global.infrastructure.s3.dto.PresignedUrlResult;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class AudioFacade {

    private static final Integer MAX_AUDIO_SIZE_BYTES = 50 * 1024 * 1024;   // 50MB

    private final AudioService audioService;
    private final S3StorageService s3StorageService;
    private final ProjectMemberService projectMemberService;

    public AudioUploadUrlResponse getAudioUploadUrl(AudioUploadUrlRequest audioUploadUrlRequest, Integer userId) {
        projectMemberService.validateProjectMember(audioUploadUrlRequest.getProjectId(), userId);

        audioService.validateMimeTypeAndExtension(audioUploadUrlRequest.getOriginalName(), audioUploadUrlRequest.getMimeType());

        PresignedUrlResult result = s3StorageService.createUploadUrl(
                audioUploadUrlRequest.getProjectId(),
                audioUploadUrlRequest.getOriginalName(),
                audioUploadUrlRequest.getMimeType().getValue(),
                audioUploadUrlRequest.getSizeBytes()
        );

        return AudioUploadUrlResponse.of(result.getObjectKey(), result.getStoredName(), result.getUploadUrl());
    }

    public AudioMetadataCreateResponse createAudioMetadata(AudioMetadataCreateRequest request, Integer userId) {
        projectMemberService.validateProjectMember(request.getProjectId(), userId);

        audioService.validateMimeTypeAndExtension(request.getOriginalName(), request.getMimeType());

        audioService.validateObjectKey(request.getProjectId(), request.getObjectKey());

        audioService.validateStoredName(request.getObjectKey(), request.getStoredName());

        s3StorageService.validateUploadedObject(request.getObjectKey(), request.getSizeBytes(), request.getMimeType().getValue());

        AudioMetadata audioMetadata = audioService.createAudioMetadata(request);

        return AudioMetadataCreateResponse.from(audioMetadata);
    }
}
