package com.salmon.studion.domain.auth.entity;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.io.Serializable;

@Table(name = "user_position")
@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UserPosition {

    @EmbeddedId
    private UserPositionId id;

    @MapsId("userId")
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    @MapsId("positionCode")
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "position_code")
    private PositionDetail positionDetail;

    @Embeddable
    @EqualsAndHashCode
    @Getter
    @NoArgsConstructor
    public static class UserPositionId implements Serializable {
        private Integer userId;
        private Integer positionCode;
    }
}
