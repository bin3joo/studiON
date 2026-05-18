package com.salmon.studion.domain.audio.event;

public record AudioMetadataDeletedEvent(
        Integer audioMetadataId,
        String objectKey
) {
}
