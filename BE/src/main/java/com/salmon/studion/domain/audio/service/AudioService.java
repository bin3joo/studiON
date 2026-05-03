package com.salmon.studion.domain.audio.service;

import com.salmon.studion.domain.audio.dto.request.AudioMetadataCreateRequest;
import com.salmon.studion.domain.audio.entity.AudioMetadata;
import com.salmon.studion.domain.audio.repository.AudioMetadataRepository;
import com.salmon.studion.global.common.enums.MimeType;
import com.salmon.studion.global.common.response.ErrorCode;
import com.salmon.studion.global.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AudioService {

    private final AudioMetadataRepository audioMetadataRepository;

    @Transactional
    public AudioMetadata createAudioMetadata(AudioMetadataCreateRequest request) {
        AudioMetadata audioMetadata = AudioMetadata.create(
                request.getObjectKey(),
                request.getOriginalName(),
                request.getStoredName(),
                request.getMimeType(),
                request.getSizeBytes(),
                request.getDurationMs()
        );

        return audioMetadataRepository.save(audioMetadata);
    }

    public void validateMimeTypeAndExtension(String originalName, MimeType mimeType) {
        int dotIndex = originalName.lastIndexOf('.');
        if (dotIndex == -1 || dotIndex == originalName.length() - 1) {
            throw new BusinessException(ErrorCode.AUDIO_INVALID_FORMAT);
        }

        String extension = originalName.substring(dotIndex + 1).toLowerCase();

        if (!mimeType.matchesExtension(extension)) {
            throw new BusinessException(ErrorCode.AUDIO_INVALID_FORMAT);
        }
    }

    public void validateObjectKey(Integer projectId, String objectKey) {
        String expectedPrefix = "projects/" + projectId + "/audios/";

        if (!objectKey.startsWith(expectedPrefix)) {
            throw new BusinessException(ErrorCode.AUDIO_INVALID_PROJECT_SCOPE);
        }
    }

    public void validateStoredName(String objectKey, String storedName) {
        if (!objectKey.endsWith("/" + storedName)) {
            throw new BusinessException(ErrorCode.AUDIO_OBJECT_KEY_MISMATCH);
        }
    }

}
