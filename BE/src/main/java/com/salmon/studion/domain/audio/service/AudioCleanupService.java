package com.salmon.studion.domain.audio.service;

import com.salmon.studion.domain.audio.entity.AudioMetadata;
import com.salmon.studion.domain.audio.event.AudioMetadataDeletedEvent;
import com.salmon.studion.domain.audio.repository.AudioMetadataRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AudioCleanupService {

    private final AudioMetadataRepository audioMetadataRepository;
    private final AudioReferenceService audioReferenceService;
    private final ApplicationEventPublisher eventPublisher;

    @Transactional
    public void cleanupIfUnreferenced(Integer audioMetadataId) {
        if (audioMetadataId == null || audioReferenceService.isReferenced(audioMetadataId)) {
            return;
        }

        AudioMetadata audioMetadata = audioMetadataRepository.findById(audioMetadataId)
                .orElse(null);
        if (audioMetadata == null || audioReferenceService.isReferenced(audioMetadataId)) {
            return;
        }

        int updated = audioMetadataRepository.softDeleteByIdIfActive(audioMetadataId);
        if (updated == 1) {
            eventPublisher.publishEvent(new AudioMetadataDeletedEvent(audioMetadataId, audioMetadata.getObjectKey()));
        }
    }
}
