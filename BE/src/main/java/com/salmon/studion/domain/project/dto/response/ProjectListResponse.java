package com.salmon.studion.domain.project.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

@Getter
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class ProjectListResponse {

    private List<ProjectSummary> projects;
    private Long currentTotalSizeBytes;

    public record ProjectSummary (
            Integer projectId,
            String  projectName,
            Integer totalBarCount,
            Integer totalPlayTime,
            Long totalAudioSize,
            LocalDateTime   lastUpdateAt,
            List<MemberSummary> members
    ) {}

    public record MemberSummary(
            Integer userId,
            String  profileImgUrl
    ) {}
}
