package com.salmon.studion.domain.ai.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
@NoArgsConstructor
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
}
