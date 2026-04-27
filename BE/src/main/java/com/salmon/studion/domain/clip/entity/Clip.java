package com.salmon.studion.domain.clip.entity;

import com.salmon.studion.domain.audio.entity.AudioMetadata;
import com.salmon.studion.domain.track.entity.Track;
import com.salmon.studion.global.common.entity.BaseEntity;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Entity
@Table(name = "clip")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Clip extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "track_id", nullable = false)
    private Track track;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "audio_metadata_id", nullable = false)
    private AudioMetadata audioMetadata;

    @Column(name = "color", nullable = false, length = 7)
    private String color = "#FFFFFF";

    @Column(name = "start", nullable = false)
    private Double start = 1.0;

    @Column(name = "duration", nullable = false)
    private Double duration = 1.0;

    @Column(name = "audio_start_ms", nullable = false)
    private Integer audioStartMs = 0;

    @Column(name = "audio_duration_ms", nullable = false)
    private Integer audioDurationMs;
}
