package com.salmon.studion.domain.audio.entity;

import com.salmon.studion.domain.project.entity.Project;
import com.salmon.studion.global.common.entity.BaseEntity;
import com.salmon.studion.global.common.enums.AudioVersionStatus;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Entity
@Table(name = "project_master_audio_version")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ProjectMasterAudioVersion extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "audio_metadata_id", nullable = false)
    private AudioMetadata audioMetadata;

    @Column(name = "name", nullable = false, length = 50)
    private String name;

    @Column(name = "memo")
    private String memo;

    @Enumerated(EnumType.STRING)
    @Column(name = "status")
    private AudioVersionStatus status;

}
