package com.salmon.studion.domain.eq.support;

public class TrackEqRedisKeys {

    public static final long LOCK_TTL_SECONDS = 30L;
    public static final long DRAFT_TTL_SECONDS = 60L * 60L * 24L;

    private static final String LOCK_KEY_PATTERN = "project:%d:track-eq:%d:lock";
    private static final String DRAFT_KEY_PATTERN = "project:%d:track-eq:%d:draft";

    private TrackEqRedisKeys() {

    }

    public static String lockKey(Integer projectId, Integer trackEqId) {
        return String.format(LOCK_KEY_PATTERN, projectId, trackEqId);
    }

    public static String draftKey(Integer projectId, Integer trackEqId) {
        return String.format(DRAFT_KEY_PATTERN, projectId, trackEqId);
    }
}
