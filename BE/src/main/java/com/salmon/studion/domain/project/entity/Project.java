package com.salmon.studion.domain.project.entity;

import com.salmon.studion.global.common.entity.BaseEntity;
import com.salmon.studion.global.common.enums.ProjectMode;
import com.salmon.studion.global.common.enums.RootNote;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

import java.time.LocalDateTime;

@Getter
@Entity
@Table(name = "project")
@SQLDelete(sql = "update project set deleted_at = now() where id = ?")
@SQLRestriction("deleted_at is null")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Project extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "root_note", nullable = false, length = 2)
    private RootNote rootNote = RootNote.C;

    @Enumerated(EnumType.STRING)
    @Column(name = "mode", nullable = false, length = 10)
    private ProjectMode mode = ProjectMode.MAJOR;

    @Column(name = "tempo", nullable = false)
    private Double tempo = 120.00;

    @Column(name = "time_sig_numerator", nullable = false)
    private Integer timeSigNumerator = 4;

    @Column(name = "time_sig_denominator", nullable = false)
    private Integer timeSigDenominator = 4;

    @Column(name = "total_bar_count", nullable = false)
    private Integer totalBarCount = 0;

    @Column(name = "total_play_time_ms", nullable = false)
    private Integer totalPlayTimeMs = 0;

    @Column(name = "track_count", nullable = false)
    private Integer trackCount = 0;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

}
