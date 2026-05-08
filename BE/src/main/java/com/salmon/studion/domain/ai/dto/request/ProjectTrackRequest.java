package com.salmon.studion.domain.ai.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class ProjectTrackRequest {

    @JsonProperty("track_id")
    private Integer trackId;

    @JsonProperty("name")
    private String name;
}
