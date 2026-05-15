package com.salmon.studion.domain.audio.dto.response;

import com.salmon.studion.global.common.enums.AudioVersionStatus;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Getter
@NoArgsConstructor
@AllArgsConstructor
public class AudioVersionCreateResponse {
    private Integer versionId;
    private String name;
    private AudioVersionStatus status;
    private LocalDateTime createdAt;
}
