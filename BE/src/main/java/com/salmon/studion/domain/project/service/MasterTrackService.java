package com.salmon.studion.domain.project.service;

import com.salmon.studion.domain.project.entity.Project;
import com.salmon.studion.domain.track.entity.MasterTrack;
import com.salmon.studion.domain.track.repository.MasterTrackRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class MasterTrackService {

    private final MasterTrackRepository masterTrackRepository;

    public MasterTrack createMasterTrack(Project project) {
        return masterTrackRepository.save(MasterTrack.create(project));
    }
}
