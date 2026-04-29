package com.salmon.studion.domain.track.entity;

import lombok.Builder;
import lombok.Getter;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

@Getter
@Builder
@Document(collection = "track_edit_events")
public class TrackEventDocument {

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

    @Field("pre_track_id")
    private Integer preTrackId;

    @Field("post_track_id")
    private Integer postTrackId;

    private Boolean undoable;

    private Boolean undone;
}
