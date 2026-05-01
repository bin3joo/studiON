package com.salmon.studion.domain.clip.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.salmon.studion.domain.clip.dto.ClipState;
import com.salmon.studion.domain.clip.dto.request.ClipLockRequest;
import com.salmon.studion.domain.clip.dto.request.ClipMoveRequest;
import com.salmon.studion.domain.clip.dto.response.ClipLockResponse;
import com.salmon.studion.domain.clip.dto.response.ClipMoveResponse;
import com.salmon.studion.domain.clip.entity.Clip;
import com.salmon.studion.domain.clip.repository.ClipEventRepository;
import com.salmon.studion.domain.clip.repository.ClipRepository;
import com.salmon.studion.domain.project.entity.Project;
import com.salmon.studion.domain.project.service.ProjectService;
import com.salmon.studion.domain.track.entity.Track;
import com.salmon.studion.global.common.response.ErrorCode;
import com.salmon.studion.global.exception.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ClipServiceTest {

    @Mock private ProjectService projectService;
    @Mock private ClipRepository clipRepository;
    @Mock private ClipEventRepository clipEventRepository;
    @Mock private RedisTemplate<String, String> redisTemplate;
    @Spy  private ObjectMapper objectMapper = new ObjectMapper();

    @InjectMocks private ClipService clipService;

    @Mock private ValueOperations<String, String> valueOperations;
    @Mock private HashOperations<String, Object, Object> hashOperations;

    private static final Integer PROJECT_ID = 1;
    private static final Integer CLIP_ID = 3;
    private static final Integer USER_ID = 1;
    private static final Integer OTHER_USER_ID = 2;
    private static final String LOCK_KEY = "project:1:clip:3:lock";
    private static final String EVENT_SEQ_KEY = "project:1:clip:event:seq";

    @BeforeEach
    void setUp() {
        lenient().when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        lenient().when(redisTemplate.opsForHash()).thenReturn(hashOperations);
        lenient().when(projectService.getProjectOrThrow(PROJECT_ID)).thenReturn(mock(Project.class));
        lenient().when(valueOperations.increment(EVENT_SEQ_KEY)).thenReturn(1L);
    }

    private ClipLockRequest lockRequest(Boolean isLocked) {
        ClipLockRequest req = new ClipLockRequest();
        req.setProjectId(PROJECT_ID);
        req.setClipId(CLIP_ID);
        req.setIsLocked(isLocked);
        return req;
    }

    @Nested
    @DisplayName("lockClip - 잠금")
    class LockTest {

        @Test
        @DisplayName("잠금 성공 시 clipId, isLocked=true, userId를 반환한다")
        void lockSuccess() {
            when(valueOperations.setIfAbsent(eq(LOCK_KEY), eq(String.valueOf(USER_ID)))).thenReturn(true);

            ClipLockResponse response = clipService.lockClip(lockRequest(true), USER_ID);

            assertThat(response.getClipId()).isEqualTo(CLIP_ID);
            assertThat(response.getIsLocked()).isTrue();
            assertThat(response.getUserId()).isEqualTo(USER_ID);
        }

        @Test
        @DisplayName("다른 사용자가 잠근 경우 CLIP_LOCKED 예외를 던진다")
        void lockFailWhenAlreadyLocked() {
            when(valueOperations.setIfAbsent(eq(LOCK_KEY), eq(String.valueOf(USER_ID)))).thenReturn(false);

            assertThatThrownBy(() -> clipService.lockClip(lockRequest(true), USER_ID))
                    .isInstanceOf(BusinessException.class)
                    .satisfies(e -> assertThat(((BusinessException) e).getErrorCode())
                            .isEqualTo(ErrorCode.CLIP_LOCKED));
        }
    }

    @Nested
    @DisplayName("lockClip - 해제")
    class UnlockTest {

        @Test
        @DisplayName("잠금자 본인이 해제 요청 시 성공하고 isLocked=false를 반환한다")
        void unlockSuccess() {
            when(valueOperations.get(LOCK_KEY)).thenReturn(String.valueOf(USER_ID));
            when(redisTemplate.delete(LOCK_KEY)).thenReturn(true);

            ClipLockResponse response = clipService.lockClip(lockRequest(false), USER_ID);

            assertThat(response.getIsLocked()).isFalse();
            assertThat(response.getUserId()).isEqualTo(USER_ID);
            verify(redisTemplate).delete(LOCK_KEY);
        }

        @Test
        @DisplayName("다른 사용자가 해제 요청 시 CLIP_LOCKED 예외를 던진다")
        void unlockFailWhenNotLocker() {
            when(valueOperations.get(LOCK_KEY)).thenReturn(String.valueOf(OTHER_USER_ID));

            assertThatThrownBy(() -> clipService.lockClip(lockRequest(false), USER_ID))
                    .isInstanceOf(BusinessException.class)
                    .satisfies(e -> assertThat(((BusinessException) e).getErrorCode())
                            .isEqualTo(ErrorCode.CLIP_LOCKED));

            verify(redisTemplate, never()).delete(LOCK_KEY);
        }

        @Test
        @DisplayName("잠금이 없는 클립에 해제 요청 시 정상 처리된다")
        void unlockWhenNotLocked() {
            when(valueOperations.get(LOCK_KEY)).thenReturn(null);
            lenient().when(redisTemplate.delete(LOCK_KEY)).thenReturn(false);

            ClipLockResponse response = clipService.lockClip(lockRequest(false), USER_ID);

            assertThat(response.getIsLocked()).isFalse();
        }
    }

    @Nested
    @DisplayName("lockClip - validate")
    class LockValidateTest {

        @Test
        @DisplayName("projectId가 null이면 INVALID_REQUEST 예외를 던진다")
        void validateProjectIdNull() {
            ClipLockRequest req = new ClipLockRequest();
            req.setClipId(CLIP_ID);
            req.setIsLocked(true);

            assertThatThrownBy(() -> clipService.lockClip(req, USER_ID))
                    .isInstanceOf(BusinessException.class)
                    .satisfies(e -> assertThat(((BusinessException) e).getErrorCode())
                            .isEqualTo(ErrorCode.INVALID_REQUEST));
        }

        @Test
        @DisplayName("clipId가 null이면 INVALID_REQUEST 예외를 던진다")
        void validateClipIdNull() {
            ClipLockRequest req = new ClipLockRequest();
            req.setProjectId(PROJECT_ID);
            req.setIsLocked(true);

            assertThatThrownBy(() -> clipService.lockClip(req, USER_ID))
                    .isInstanceOf(BusinessException.class)
                    .satisfies(e -> assertThat(((BusinessException) e).getErrorCode())
                            .isEqualTo(ErrorCode.INVALID_REQUEST));
        }

        @Test
        @DisplayName("isLocked가 null이면 INVALID_REQUEST 예외를 던진다")
        void validateIsLockedNull() {
            ClipLockRequest req = new ClipLockRequest();
            req.setProjectId(PROJECT_ID);
            req.setClipId(CLIP_ID);

            assertThatThrownBy(() -> clipService.lockClip(req, USER_ID))
                    .isInstanceOf(BusinessException.class)
                    .satisfies(e -> assertThat(((BusinessException) e).getErrorCode())
                            .isEqualTo(ErrorCode.INVALID_REQUEST));
        }
    }

    @Nested
    @DisplayName("moveClip")
    class MoveClipTest {

        private static final Integer ORIGINAL_TRACK_ID = 1;
        private static final Integer TARGET_TRACK_ID = 2;
        private static final Double ORIGINAL_START = 1.0;
        private static final Double ORIGINAL_DURATION = 4.0;
        private static final Double TARGET_START = 4.5;
        private static final String CLIP_STATE_KEY = "project:1:clips";

        private Map<String, String> store;

        @BeforeEach
        void setUp() {
            store = new HashMap<>();

            lenient().when(valueOperations.get(LOCK_KEY)).thenReturn(String.valueOf(USER_ID));

            lenient().doAnswer(inv -> store.get(inv.getArgument(1).toString()))
                    .when(hashOperations).get(eq(CLIP_STATE_KEY), any());
            lenient().doAnswer(inv -> {
                store.put(inv.getArgument(1).toString(), inv.getArgument(2).toString());
                return null;
            }).when(hashOperations).put(eq(CLIP_STATE_KEY), any(), any());
        }

        private ClipMoveRequest moveRequest(Integer clipId, Integer targetTrackId, Double targetStartBar) {
            ClipMoveRequest req = new ClipMoveRequest();
            req.setProjectId(PROJECT_ID);
            req.setClipId(clipId);
            req.setTargetTrackId(targetTrackId);
            req.setTargetStartBar(targetStartBar);
            return req;
        }

        private String clipStateJson(Integer trackId, Double start, Double duration) throws JsonProcessingException {
            return objectMapper.writeValueAsString(ClipState.builder()
                    .clipId(CLIP_ID).trackId(trackId).start(start).duration(duration)
                    .build());
        }

        @Test
        @DisplayName("Redis에 클립 상태가 있을 때 이동 성공 시 before/after 위치를 반환하고 Redis 상태를 업데이트한다")
        void moveSuccess_fromRedis() throws JsonProcessingException {
            store.put(String.valueOf(CLIP_ID), clipStateJson(ORIGINAL_TRACK_ID, ORIGINAL_START, ORIGINAL_DURATION));

            ClipMoveResponse response = clipService.moveClip(
                    moveRequest(CLIP_ID, TARGET_TRACK_ID, TARGET_START), USER_ID);

            assertThat(response.getClipId()).isEqualTo(CLIP_ID);
            assertThat(response.getBefore().getTrackId()).isEqualTo(ORIGINAL_TRACK_ID);
            assertThat(response.getBefore().getStartBar()).isEqualTo(ORIGINAL_START);
            assertThat(response.getAfter().getTrackId()).isEqualTo(TARGET_TRACK_ID);
            assertThat(response.getAfter().getStartBar()).isEqualTo(TARGET_START);

            ClipState updatedState = objectMapper.readValue(store.get(String.valueOf(CLIP_ID)), ClipState.class);
            assertThat(updatedState.getTrackId()).isEqualTo(TARGET_TRACK_ID);
            assertThat(updatedState.getStart()).isEqualTo(TARGET_START);
            assertThat(updatedState.getDuration()).isEqualTo(ORIGINAL_DURATION);
        }

        @Test
        @DisplayName("Redis에 클립 상태가 없을 때 MySQL에서 로드 후 이동 성공한다")
        void moveSuccess_lazyInit() throws JsonProcessingException {
            Track mockTrack = mock(Track.class);
            Clip mockClip = mock(Clip.class);
            when(mockTrack.getId()).thenReturn(ORIGINAL_TRACK_ID);
            when(mockClip.getId()).thenReturn(CLIP_ID);
            when(mockClip.getTrack()).thenReturn(mockTrack);
            when(mockClip.getStart()).thenReturn(ORIGINAL_START);
            when(mockClip.getDuration()).thenReturn(ORIGINAL_DURATION);
            when(clipRepository.findById(CLIP_ID)).thenReturn(Optional.of(mockClip));

            ClipMoveResponse response = clipService.moveClip(
                    moveRequest(CLIP_ID, TARGET_TRACK_ID, TARGET_START), USER_ID);

            assertThat(response.getBefore().getTrackId()).isEqualTo(ORIGINAL_TRACK_ID);
            assertThat(response.getBefore().getStartBar()).isEqualTo(ORIGINAL_START);
            assertThat(response.getAfter().getTrackId()).isEqualTo(TARGET_TRACK_ID);
            assertThat(response.getAfter().getStartBar()).isEqualTo(TARGET_START);

            ClipState updatedState = objectMapper.readValue(store.get(String.valueOf(CLIP_ID)), ClipState.class);
            assertThat(updatedState.getTrackId()).isEqualTo(TARGET_TRACK_ID);
        }

        @Test
        @DisplayName("클립이 잠겨있지 않으면 CLIP_LOCKED 예외를 던진다")
        void moveFailWhenNotLocked() {
            when(valueOperations.get(LOCK_KEY)).thenReturn(null);

            assertThatThrownBy(() -> clipService.moveClip(
                    moveRequest(CLIP_ID, TARGET_TRACK_ID, TARGET_START), USER_ID))
                    .isInstanceOf(BusinessException.class)
                    .satisfies(e -> assertThat(((BusinessException) e).getErrorCode())
                            .isEqualTo(ErrorCode.CLIP_LOCKED));
        }

        @Test
        @DisplayName("다른 사용자가 잠근 클립에 이동 요청 시 CLIP_LOCKED 예외를 던진다")
        void moveFailWhenLockedByOtherUser() {
            when(valueOperations.get(LOCK_KEY)).thenReturn(String.valueOf(OTHER_USER_ID));

            assertThatThrownBy(() -> clipService.moveClip(
                    moveRequest(CLIP_ID, TARGET_TRACK_ID, TARGET_START), USER_ID))
                    .isInstanceOf(BusinessException.class)
                    .satisfies(e -> assertThat(((BusinessException) e).getErrorCode())
                            .isEqualTo(ErrorCode.CLIP_LOCKED));
        }

        @Test
        @DisplayName("Redis에 없고 MySQL에도 없는 클립 이동 시 CLIP_NOT_FOUND 예외를 던진다")
        void moveFailWhenClipNotFound() {
            when(clipRepository.findById(CLIP_ID)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> clipService.moveClip(
                    moveRequest(CLIP_ID, TARGET_TRACK_ID, TARGET_START), USER_ID))
                    .isInstanceOf(BusinessException.class)
                    .satisfies(e -> assertThat(((BusinessException) e).getErrorCode())
                            .isEqualTo(ErrorCode.CLIP_NOT_FOUND));
        }

        @Nested
        @DisplayName("validate")
        class ValidateTest {

            @Test
            @DisplayName("projectId가 null이면 INVALID_REQUEST 예외를 던진다")
            void projectIdNull() {
                ClipMoveRequest req = new ClipMoveRequest();
                req.setClipId(CLIP_ID);
                req.setTargetTrackId(TARGET_TRACK_ID);
                req.setTargetStartBar(TARGET_START);

                assertThatThrownBy(() -> clipService.moveClip(req, USER_ID))
                        .isInstanceOf(BusinessException.class)
                        .satisfies(e -> assertThat(((BusinessException) e).getErrorCode())
                                .isEqualTo(ErrorCode.INVALID_REQUEST));
            }

            @Test
            @DisplayName("clipId가 null이면 INVALID_REQUEST 예외를 던진다")
            void clipIdNull() {
                ClipMoveRequest req = new ClipMoveRequest();
                req.setProjectId(PROJECT_ID);
                req.setTargetTrackId(TARGET_TRACK_ID);
                req.setTargetStartBar(TARGET_START);

                assertThatThrownBy(() -> clipService.moveClip(req, USER_ID))
                        .isInstanceOf(BusinessException.class)
                        .satisfies(e -> assertThat(((BusinessException) e).getErrorCode())
                                .isEqualTo(ErrorCode.INVALID_REQUEST));
            }

            @Test
            @DisplayName("targetTrackId가 null이면 INVALID_REQUEST 예외를 던진다")
            void targetTrackIdNull() {
                ClipMoveRequest req = new ClipMoveRequest();
                req.setProjectId(PROJECT_ID);
                req.setClipId(CLIP_ID);
                req.setTargetStartBar(TARGET_START);

                assertThatThrownBy(() -> clipService.moveClip(req, USER_ID))
                        .isInstanceOf(BusinessException.class)
                        .satisfies(e -> assertThat(((BusinessException) e).getErrorCode())
                                .isEqualTo(ErrorCode.INVALID_REQUEST));
            }

            @Test
            @DisplayName("targetStartBar가 null이면 INVALID_REQUEST 예외를 던진다")
            void targetStartBarNull() {
                ClipMoveRequest req = new ClipMoveRequest();
                req.setProjectId(PROJECT_ID);
                req.setClipId(CLIP_ID);
                req.setTargetTrackId(TARGET_TRACK_ID);

                assertThatThrownBy(() -> clipService.moveClip(req, USER_ID))
                        .isInstanceOf(BusinessException.class)
                        .satisfies(e -> assertThat(((BusinessException) e).getErrorCode())
                                .isEqualTo(ErrorCode.INVALID_REQUEST));
            }
        }
    }
}
