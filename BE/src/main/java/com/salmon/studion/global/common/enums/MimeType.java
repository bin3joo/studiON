package com.salmon.studion.global.common.enums;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum MimeType {
    MPEG("audio/mpeg"),
    WAV("audio/wav");

    private final String value;
}
