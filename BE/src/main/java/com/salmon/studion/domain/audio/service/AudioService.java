package com.salmon.studion.domain.audio.service;

import com.salmon.studion.domain.audio.repository.AudioMetadataRepository;
import com.salmon.studion.global.common.enums.MimeType;
import com.salmon.studion.global.common.response.ErrorCode;
import com.salmon.studion.global.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AudioService {
    private final AudioMetadataRepository audioMetadataRepository;

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


}
