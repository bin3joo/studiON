package com.salmon.studion.domain.audio.dto.response;

import com.salmon.studion.domain.audio.entity.AudioMetadata;
import com.salmon.studion.global.common.enums.MimeType;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class AudioMetadataCreateResponse {

    private Integer audioMetadataId;
    private String objectKey;
    private String originalName;
    private String storedName;
    private MimeType mimeType;
    private Integer sizeBytes;
    private Integer durationMs;

    public static AudioMetadataCreateResponse from(AudioMetadata audioMetadata) {
        return new AudioMetadataCreateResponse(
                audioMetadata.getId(),
                audioMetadata.getObjectKey(),
                audioMetadata.getOriginalName(),
                audioMetadata.getStoredName(),
                audioMetadata.getMimeType(),
                audioMetadata.getSizeBytes(),
                audioMetadata.getDurationMs()
        );
    }
}