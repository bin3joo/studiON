package com.salmon.studion.domain.chat.entity;

import com.salmon.studion.domain.auth.entity.User;
import com.salmon.studion.global.common.entity.BaseEntity;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.io.Serializable;

@Table(name = "dm_room_member")
@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DmRoomMember extends BaseEntity {

    @EmbeddedId
    private DmRoomMemberId id;

    @MapsId("dmRoomId")
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "dm_room_id")
    private DmRoom dmRoom;

    @MapsId("userId")
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    @Embeddable
    @EqualsAndHashCode
    @Getter
    @NoArgsConstructor
    public static class DmRoomMemberId implements Serializable {
        private Integer userId;
        private Integer dmRoomId;
    }
}
