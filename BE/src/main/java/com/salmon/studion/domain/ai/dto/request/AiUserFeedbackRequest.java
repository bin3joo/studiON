package com.salmon.studion.domain.ai.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.salmon.studion.global.common.enums.UserFeedbackType;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class AiUserFeedbackRequest {

    @JsonProperty("job_id")
    private Integer jobId;

    @JsonProperty("project_id")
    private Integer projectId;

    @JsonProperty("selected_region_id")
    private Integer selectedRegionId;

    @JsonProperty("preserve_clip_id")
    private Integer preserveClipId;

    @JsonProperty("user_feedback_message")
    private String userFeedbackMessage;

    @JsonProperty("user_decision")
    private UserFeedbackType userDecision;


    public static AiUserFeedbackRequest create(
        Integer jobId,
        AiUserFeedbackApiRequest request
    ) {
        return new AiUserFeedbackRequest(
                jobId,
                request.getProjectId(),
                request.getSelectedRegionId(),
                request.getPreserveClipId(),
                request.getUserFeedbackMessage(),
                request.getUserDecision()
        );
    }
}
