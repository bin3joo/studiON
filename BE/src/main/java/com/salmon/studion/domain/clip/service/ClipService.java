package com.salmon.studion.domain.clip.service;

import com.salmon.studion.domain.clip.entity.Clip;
import com.salmon.studion.domain.clip.repository.ClipRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class ClipService {

    private final ClipRepository clipRepository;

    public List<Clip> getClipsWithAudioMetadataByTrackIds(List<Integer> trackIds) {
        if (trackIds == null || trackIds.isEmpty()) {
            return List.of();
        }

        return clipRepository.findAllWithAudioMetadataByTrackIds(trackIds);
    }
}
