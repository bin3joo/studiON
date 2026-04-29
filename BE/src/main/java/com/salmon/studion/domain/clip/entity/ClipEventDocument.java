package com.salmon.studion.domain.clip.entity;

import lombok.Builder;
import lombok.Getter;
import org.springframework.data.mongodb.core.mapping.Document;

@Getter
@Builder
@Document(collection = "clip_edit_events")
public class ClipEventDocument {

}
