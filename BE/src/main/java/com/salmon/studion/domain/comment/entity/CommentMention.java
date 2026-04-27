package com.salmon.studion.domain.comment.entity;

import com.salmon.studion.domain.auth.entity.User;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.io.Serializable;

@Table(name = "comment_mention")
@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CommentMention {
    @EmbeddedId
    private CommentMentionId id;

    @MapsId("commentId")
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "comment_id")
    private Comment comment;

    @MapsId("userId")
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    @Embeddable
    @EqualsAndHashCode
    @Getter
    @NoArgsConstructor
    public static class CommentMentionId implements Serializable {
        private Integer userId;
        private Integer commentId;
    }
}
