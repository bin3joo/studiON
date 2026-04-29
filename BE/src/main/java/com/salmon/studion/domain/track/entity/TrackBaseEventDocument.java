package com.salmon.studion.domain.track.entity;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

@Getter
@SuperBuilder
@NoArgsConstructor
@Document(collection = "track_edit_events")
public abstract class TrackBaseEventDocument {

    @Id
    private String id;

    private String event;

    @Field("project_id")
    private Integer projectId;

    @Field("track_id")
    private Integer trackId;

    @Field("user_id")
    private Integer userId;

    @Field("sequenceNo")
    private Long sequenceNo;

    private String timestamp;

    private Boolean undoable;

    private Boolean undone;
}
