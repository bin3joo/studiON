package com.salmon.studion.domain.audio.facade;

import com.salmon.studion.domain.audio.dto.request.AudioVersionCreateRequest;
import com.salmon.studion.domain.audio.dto.response.AudioVersionCreateResponse;
import com.salmon.studion.domain.audio.dto.response.AudioVersionDeleteResponse;
import com.salmon.studion.domain.audio.dto.response.AudioVersionDownloadUrlResponse;
import com.salmon.studion.domain.audio.dto.response.AudioVersionListResponse;
import com.salmon.studion.domain.audio.service.AudioVersionService;
import com.salmon.studion.domain.project.service.ProjectMemberService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class AudioVersionFacade {

    private final ProjectMemberService projectMemberService;
    private final AudioVersionService audioVersionService;

    public AudioVersionCreateResponse createAudioVersion(Integer projectId, AudioVersionCreateRequest request, Integer userId) {
        return null;
    }

    public AudioVersionListResponse getAudioVersionList(Integer projectId, Integer userId) {
        projectMemberService.validateProjectMember(projectId, userId);

        return audioVersionService.getAudioVersionList(projectId);
    }

    public AudioVersionDownloadUrlResponse getAudioVersionDownloadUrl(Integer projectId, Integer versionId, Integer userId) {
        return null;
    }

    public AudioVersionDeleteResponse deleteAudioVersion(Integer projectId, Integer versionId, Integer userId) {
        projectMemberService.validateProjectMember(projectId, userId);

        return audioVersionService.deleteAudioVersion(projectId, versionId);
    }
}
