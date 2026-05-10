package com.salmon.studion.domain.ai.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.salmon.studion.global.common.enums.UserFeedbackType;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class AiUserFeedbackApiRequest {

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
}
