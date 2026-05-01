package com.salmon.studion.domain.clip.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ClipState {
    private Integer clipId;
    private Integer trackId;
    private Double start;
    private Double duration;
}
