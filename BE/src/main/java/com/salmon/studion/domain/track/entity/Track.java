package com.salmon.studion.domain.track.entity;

import com.salmon.studion.domain.project.entity.Project;
import com.salmon.studion.global.common.entity.BaseEntity;
import com.salmon.studion.global.common.enums.TrackType;
import jakarta.persistence.*;
import lombok.*;

@Getter
@Entity
@Table(name = "track")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Track extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @Column(name = "pre_track_id")
    private Integer preTrackId;

    @Column(name = "post_track_id")
    private Integer postTrackId;

    @Enumerated(EnumType.STRING)
    @Column(name = "track_type", nullable = false)
    private TrackType trackType = TrackType.AUDIO;

    @Column(name = "name")
    private String name;

    @Column(name = "is_soloed", nullable = false)
    private Boolean isSoloed = false;

    @Column(name = "is_muted", nullable = false)
    private Boolean isMuted = false;

    @Column(name = "volume", nullable = false)
    private Double volume = 0.0;

    @Column(name = "pan", nullable = false)
    private Integer pan = 0;

    @Builder
    private Track(Project project, Integer preTrackId, Integer postTrackId, TrackType trackType, String name) {
        this.project = project;
        this.preTrackId = preTrackId;
        this.postTrackId = postTrackId;
        this.trackType = trackType != null ? trackType : TrackType.AUDIO;
        this.name = name;
    }

    public void updatePostTrackId(Integer postTrackId) {
        this.postTrackId = postTrackId;
    }

    public void updatePreTrackId(Integer preTrackId) {
        this.preTrackId = preTrackId;
    }
}
