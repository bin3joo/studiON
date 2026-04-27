package com.salmon.studion.domain.track.entity;

import com.salmon.studion.domain.project.entity.Project;
import com.salmon.studion.global.common.enums.TrackType;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Entity
@Table(name = "track")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Track {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @Column(name = "pre_track_id", nullable = false)
    private Integer preTrackId;

    @Column(name = "post_track_id", nullable = false)
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
}
