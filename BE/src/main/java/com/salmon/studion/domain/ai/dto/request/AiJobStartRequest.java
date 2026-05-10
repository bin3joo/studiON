package com.salmon.studion.domain.ai.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.util.List;

@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class AiJobStartRequest {

    @NotNull
    @JsonProperty("job_id")
    private Integer jobId;

    @NotNull
    @JsonProperty("project_id")
    private Integer projectId;

    @JsonProperty("requested_by")
    private Integer requestedBy;

    @NotEmpty
    @JsonProperty("issue_types")
    private List<String> issueTypes;

    @NotBlank
    @JsonProperty("validator_mode")
    private String validatorMode;

    @NotBlank
    @JsonProperty("critic_mode")
    private String criticMode;

    @NotNull
    @JsonProperty("project_snapshot")
    private ProjectSnapshotRequest projectSnapshotRequest;

    public static AiJobStartRequest create(
            Integer jobId,
            AiJobStartApiRequest request,
            Integer requestedBy
    ) {
        return new AiJobStartRequest(
                jobId,
                request.getProjectId(),
                requestedBy,
                request.getIssueTypes(),
                request.getValidatorMode(),
                request.getCriticMode(),
                request.getProjectSnapshot()
        );
    }
}
