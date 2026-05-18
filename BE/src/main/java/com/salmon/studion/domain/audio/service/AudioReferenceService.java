package com.salmon.studion.domain.audio.service;

import com.salmon.studion.domain.audio.repository.AudioVersionRepository;
import com.salmon.studion.domain.clip.repository.ClipRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AudioReferenceService {

    private final ClipRepository clipRepository;
    private final AudioVersionRepository audioVersionRepository;

    public long countClipReferences(Integer audioMetadataId) {
        return clipRepository.countByAudioMetadata_Id(audioMetadataId);
    }

    public long countVersionReferences(Integer audioMetadataId) {
        return audioVersionRepository.countByAudioMetadata_Id(audioMetadataId);
    }

    public boolean isReferenced(Integer audioMetadataId) {
        return countClipReferences(audioMetadataId) > 0 || countVersionReferences(audioMetadataId) > 0;
    }
}
