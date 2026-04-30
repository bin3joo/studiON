package com.salmon.studion.domain.clip.service;

import com.salmon.studion.domain.clip.dto.request.ClipLockRequest;
import com.salmon.studion.domain.clip.dto.response.ClipLockResponse;
import com.salmon.studion.domain.clip.repository.ClipEventRepository;
import com.salmon.studion.domain.clip.repository.ClipRepository;
import com.salmon.studion.domain.project.entity.Project;
import com.salmon.studion.domain.project.service.ProjectService;
import com.salmon.studion.global.common.response.ErrorCode;
import com.salmon.studion.global.exception.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ClipServiceTest {

    @Mock private ProjectService projectService;
    @Mock private ClipRepository clipRepository;
    @Mock private ClipEventRepository clipEventRepository;
    @Mock private RedisTemplate<String, String> redisTemplate;

    @InjectMocks private ClipService clipService;

    @Mock private ValueOperations<String, String> valueOperations;

    private static final Integer PROJECT_ID = 1;
    private static final Integer CLIP_ID = 3;
    private static final Integer USER_ID = 1;
    private static final Integer OTHER_USER_ID = 2;
    private static final String LOCK_KEY = "project:1:clip:3:lock";
    private static final String EVENT_SEQ_KEY = "project:1:clip:event:seq";

    @BeforeEach
    void setUp() {
        lenient().when(redisTemplate.opsForValue()).thenReturn(valueOperations);
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
    class ValidateTest {

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
}
