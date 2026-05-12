package com.salmon.studion.domain.ai.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;

@Getter
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class ProjectSnapshotRequest {

    @JsonProperty("duration_ms")
    private Integer durationMs;

    @JsonProperty("bpm")
    private Integer bpm;

    @JsonProperty("numerator")
    private Integer numerator;

    @JsonProperty("denominator")
    private Integer denominator;

    @JsonProperty("tracks")
    private List<ProjectTrackRequest> projectTrackRequest;

    @JsonProperty("clips")
    private List<ProjectClipRequest> projectClipRequest;

    public static ProjectSnapshotRequest create(
            ProjectSnapshotRequest source,
            List<ProjectTrackRequest> tracks,
            List<ProjectClipRequest> clips
    ) {
        return new ProjectSnapshotRequest(
                source.getDurationMs(),
                source.getBpm(),
                source.getNumerator(),
                source.getDenominator(),
                tracks,
                clips
        );
    }
}
