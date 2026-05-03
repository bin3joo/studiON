package com.salmon.studion.domain.audio.dto.request;

import com.salmon.studion.global.common.enums.MimeType;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class AudioUploadUrlRequest {

    public static final int MAX_AUDIO_SIZE_BYTES = 50 * 1024 * 1024;

    @NotNull(message = "프로젝트ID는 필수입니다.")
    private Integer projectId;

    @NotBlank(message = "파일의 이름은 필수입니다.")
    private String originalName;

    @NotNull(message = "파일 MIME 타입은 필수입니다.")
    private MimeType mimeType;

    @NotNull(message = "파일 크기는 필수입니다.")
    @Positive(message = "파일 크기는 0보다 커야 합니다.")
    @Max(value = MAX_AUDIO_SIZE_BYTES, message = "파일 크기는 50MB를 초과할 수 없습니다.")
    private Integer sizeBytes;

    @NotNull(message = "오디오의 길이는 필수입니다.")
    @Positive(message = "오디오의 길이는 0보다 커야 합니다.")
    private Integer durationMs;
}
