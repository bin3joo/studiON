package com.salmon.studion.domain.track.dto.request;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class TrackReorderRequest {
    private Integer projectId;
    private Integer trackId;
    private Integer targetPreTrackId;
    private Integer targetPostTrackId;
}
