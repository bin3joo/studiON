package com.salmon.studion.global.common.enums;

public enum ProjectWebSocketEventType {

    PROJECT_JOIN,
    PROJECT_ONLINE_USERS,
    USER_JOINED_PROJECT;

    public static ProjectWebSocketEventType from(String event) {
        for (ProjectWebSocketEventType value : values()) {
            if (value.name().equals(event)) {
                return value;
            }
        }
        return null;
    }
}
