package com.salmon.studion.domain.track.dto.request;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class TrackAddRequest {
    private Integer projectId;
    private String name;
    private String type;
}
