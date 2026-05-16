package com.salmon.studion.domain.audio.service;

import com.salmon.studion.domain.audio.dto.response.AudioVersionDeleteResponse;
import com.salmon.studion.domain.audio.dto.response.AudioVersionListResponse;
import com.salmon.studion.domain.audio.entity.AudioMetadata;
import com.salmon.studion.domain.audio.entity.ProjectMasterAudioVersion;
import com.salmon.studion.domain.audio.repository.AudioMetadataRepository;
import com.salmon.studion.domain.audio.repository.AudioVersionRepository;
import com.salmon.studion.global.common.enums.AudioVersionStatus;
import com.salmon.studion.global.common.response.ErrorCode;
import com.salmon.studion.global.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class AudioVersionService {

    private final AudioVersionRepository audioVersionRepository;
    private final AudioMetadataRepository audioMetadataRepository;

    @Transactional(readOnly = true)
    public AudioVersionListResponse getAudioVersionList(Integer projectId) {
        List<ProjectMasterAudioVersion> audioVersions =
                audioVersionRepository.findAllByProjectIdAndStatusReady(projectId, AudioVersionStatus.READY);

        List<AudioVersionListResponse.AudioVersionSummary> versions = audioVersions.stream()
                .map(audioVersion -> new AudioVersionListResponse.AudioVersionSummary(
                        audioVersion.getId(),
                        audioVersion.getName(),
                        audioVersion.getMemo(),
                        audioVersion.getAudioMetadata().getDurationMs(),
                        audioVersion.getAudioMetadata().getSizeBytes(),
                        audioVersion.getCreatedAt()
                ))
                .toList();

        return new AudioVersionListResponse(versions.size(), versions);
    }

    @Transactional
    public AudioVersionDeleteResponse deleteAudioVersion(Integer projectId, Integer versionId) {
        ProjectMasterAudioVersion audioVersion = audioVersionRepository.findByIdAndProjectIdWithAudioMetadata(versionId, projectId)
                .orElseThrow(() -> new BusinessException(ErrorCode.AUDIO_VERSION_NOT_FOUND));

        AudioMetadata audioMetadata = audioVersion.getAudioMetadata();

        audioVersionRepository.delete(audioVersion);
        audioMetadataRepository.delete(audioMetadata);

        return new AudioVersionDeleteResponse(versionId, true);
    }
}
