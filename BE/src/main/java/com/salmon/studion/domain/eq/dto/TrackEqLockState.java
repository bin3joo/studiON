package com.salmon.studion.domain.eq.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TrackEqLockState {

    private Integer projectId;
    private Integer trackEqId;
    private Integer userId;
    private String userName;
    private String sessionId;
    private String token;
    private LocalDateTime lockedAt;
    private LocalDateTime expiresAt;
}
