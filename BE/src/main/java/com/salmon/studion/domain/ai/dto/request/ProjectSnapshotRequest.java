package com.salmon.studion.domain.ai.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;

@Getter
@NoArgsConstructor
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
}
