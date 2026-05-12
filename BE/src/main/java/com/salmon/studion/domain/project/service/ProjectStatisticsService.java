package com.salmon.studion.domain.project.service;

import com.salmon.studion.domain.audio.entity.AudioMetadata;
import com.salmon.studion.domain.clip.entity.Clip;
import com.salmon.studion.domain.clip.repository.ClipRepository;
import com.salmon.studion.domain.project.entity.Project;
import com.salmon.studion.domain.track.entity.Track;
import com.salmon.studion.domain.track.repository.TrackRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ProjectStatisticsService {

    private final ProjectService projectService;
    private final TrackRepository trackRepository;
    private final ClipRepository clipRepository;

    @Transactional
    public void refresh(Integer projectId) {
        Project project = projectService.getProjectOrThrow(projectId);
        List<Track> tracks = trackRepository.findByProject_Id(projectId);
        List<Clip> clips = clipRepository.findAllWithAudioMetadataByProjectId(projectId);

        int trackCount = tracks.size();
        int totalBarCount = calculateTotalBarCount(clips);
        int totalPlayTimeMs = calculateTotalPlayTimeMs(project, totalBarCount);
        long totalAudioSizeByte = calculateTotalAudioSizeByte(clips);

        project.refreshSnapshotStatistics(trackCount, totalBarCount, totalPlayTimeMs, totalAudioSizeByte);
    }

    private int calculateTotalBarCount(List<Clip> clips) {
        return (int) Math.ceil(
                clips.stream()
                        .mapToDouble(clip -> clip.getStart() + clip.getDuration() - 1.0)
                        .max()
                        .orElse(0.0)
        );
    }

    private int calculateTotalPlayTimeMs(Project project, int totalBarCount) {
        if (totalBarCount <= 0) {
            return 0;
        }

        double msPerBeat = 60_000d / project.getTempo();
        double msPerBar = msPerBeat * project.getTimeSigNumerator();
        return (int) Math.ceil(totalBarCount * msPerBar);
    }

    private long calculateTotalAudioSizeByte(List<Clip> clips) {
        Map<Integer, AudioMetadata> audioById = clips.stream()
                .map(Clip::getAudioMetadata)
                .collect(Collectors.toMap(
                        AudioMetadata::getId,
                        Function.identity(),
                        (left, right) -> left
                ));
        return audioById.values().stream()
                .map(AudioMetadata::getSizeBytes)
                .filter(Objects::nonNull)
                .mapToLong(Integer::longValue)
                .sum();
    }
}
