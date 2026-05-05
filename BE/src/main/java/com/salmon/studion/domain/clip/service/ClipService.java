package com.salmon.studion.domain.clip.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.salmon.studion.domain.clip.dto.ClipState;
import com.salmon.studion.domain.clip.dto.request.ClipCutRequest;
import com.salmon.studion.domain.clip.dto.request.ClipLockRequest;
import com.salmon.studion.domain.clip.dto.request.ClipMoveRequest;
import com.salmon.studion.domain.clip.dto.request.ClipDeleteRequest;
import com.salmon.studion.domain.clip.dto.request.ClipResizeRequest;
import com.salmon.studion.domain.clip.dto.request.ClipDuplicateRequest;
import com.salmon.studion.domain.clip.dto.request.ClipSplitRequest;
import com.salmon.studion.domain.clip.dto.response.ClipCutResponse;
import com.salmon.studion.domain.clip.dto.response.ClipDeleteResponse;
import com.salmon.studion.domain.clip.dto.response.ClipDuplicateResponse;
import com.salmon.studion.domain.clip.dto.response.ClipLockResponse;
import com.salmon.studion.domain.clip.dto.response.ClipMoveResponse;
import com.salmon.studion.domain.clip.dto.response.ClipResizeResponse;
import com.salmon.studion.domain.clip.dto.response.ClipSplitResponse;
import com.salmon.studion.domain.clip.entity.Clip;
import com.salmon.studion.domain.clip.entity.ClipDeleteEventDocument;
import com.salmon.studion.domain.clip.entity.ClipDuplicateEventDocument;
import com.salmon.studion.domain.clip.entity.ClipLockEventDocument;
import com.salmon.studion.domain.clip.entity.ClipMoveEventDocument;
import com.salmon.studion.domain.clip.entity.ClipResizeEventDocument;
import com.salmon.studion.domain.clip.entity.ClipSplitEventDocument;
import com.salmon.studion.domain.clip.repository.ClipEventRepository;
import com.salmon.studion.domain.clip.repository.ClipRepository;
import com.salmon.studion.domain.project.service.ProjectService;
import com.salmon.studion.global.common.response.ErrorCode;
import com.salmon.studion.global.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.SessionCallback;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class ClipService {

    private static final String CLIP_LOCK_KEY = "project:%d:clip:%d:lock";
    private static final String CLIP_EVENT_SEQ_KEY = "project:%d:clip:event:seq";
    private static final String CLIP_STATE_KEY = "project:%d:clips";
    private static final String CLIP_ID_SEQ_KEY = "project:%d:clip:id_seq";
    private static final String CLIP_CLIPBOARD_KEY = "project:%d:user:%d:clipboard";

    private final ProjectService projectService;
    private final ClipRepository clipRepository;
    private final ClipEventRepository clipEventRepository;
    private final RedisTemplate<String, String> redisTemplate;
    private final ObjectMapper objectMapper;

    /*
        Clip Lock 실행/해제 메서드
        Redis 분산 락으로 구현
     */
    public ClipLockResponse lockClip(ClipLockRequest request, Integer userId) {
        // NPE 방지
        request.validate();

        // 프로젝트 존재여부 확인
        projectService.getProjectOrThrow(request.getProjectId());

        // 락을 위한 key
        String lockKey = String.format(CLIP_LOCK_KEY, request.getProjectId(), request.getClipId());

        // 락을 걸어달라는 요청의 경우
        if (request.getIsLocked()) {
            Boolean acquired = redisTemplate.opsForValue().setIfAbsent(lockKey, String.valueOf(userId));
            if (Boolean.FALSE.equals(acquired)) {
                throw new BusinessException(ErrorCode.CLIP_LOCKED);
            }
        }
        // 락을 풀어달라는 요청의 경우
        else {
            String currentLocker = redisTemplate.opsForValue().get(lockKey);
            if (currentLocker != null && !currentLocker.equals(String.valueOf(userId))) {
                throw new BusinessException(ErrorCode.CLIP_LOCKED);
            }
            redisTemplate.delete(lockKey);
        }

        Long sequenceNo = redisTemplate.opsForValue()
                .increment(String.format(CLIP_EVENT_SEQ_KEY, request.getProjectId()));

        try {
            clipEventRepository.save(ClipLockEventDocument.builder()
                    .event("CLIP_LOCK")
                    .projectId(request.getProjectId())
                    .clipId(request.getClipId())
                    .userId(userId)
                    .sequenceNo(sequenceNo)
                    .timestamp(LocalDateTime.now())
                    .isLocked(request.getIsLocked())
                    .build());
        } catch (Exception e) {
            log.error("[MongoDB 이벤트 저장 실패]: event=CLIP_LOCK, clipId={}", request.getClipId(), e);
        }

        return ClipLockResponse.builder()
                .clipId(request.getClipId())
                .isLocked(request.getIsLocked())
                .userId(userId)
                .build();
    }

    /*
        클립의 위치를 이동하는 메서드
     */
    public ClipMoveResponse moveClip(ClipMoveRequest request, Integer userId) {
        request.validate();

        projectService.getProjectOrThrow(request.getProjectId());

        String lockKey = String.format(CLIP_LOCK_KEY, request.getProjectId(), request.getClipId());
        String currentLocker = redisTemplate.opsForValue().get(lockKey);
        if (!String.valueOf(userId).equals(currentLocker)) {
            throw new BusinessException(ErrorCode.CLIP_LOCKED);
        }

        ClipState state = getOrLoadClipState(request.getProjectId(), request.getClipId());

        Integer beforeTrackId = state.getTrackId();
        Double beforeStartBar = state.getStart();

        ClipState updated = ClipState.builder()
                .clipId(state.getClipId())
                .trackId(request.getTargetTrackId())
                .start(request.getTargetStartBar())
                .duration(state.getDuration())
                .build();
        saveClipStateToRedis(request.getProjectId(), updated);

        Long sequenceNo = redisTemplate.opsForValue()
                .increment(String.format(CLIP_EVENT_SEQ_KEY, request.getProjectId()));

        try {
            clipEventRepository.save(ClipMoveEventDocument.builder()
                    .event("CLIP_MOVE")
                    .projectId(request.getProjectId())
                    .clipId(request.getClipId())
                    .userId(userId)
                    .sequenceNo(sequenceNo)
                    .timestamp(LocalDateTime.now())
                    .before(ClipMoveEventDocument.ClipPosition.builder()
                            .trackId(beforeTrackId)
                            .startBar(beforeStartBar)
                            .build())
                    .after(ClipMoveEventDocument.ClipPosition.builder()
                            .trackId(request.getTargetTrackId())
                            .startBar(request.getTargetStartBar())
                            .build())
                    .undoable(true)
                    .undone(false)
                    .build());
        } catch (Exception e) {
            log.error("[MongoDB 이벤트 저장 실패]: event=CLIP_MOVE, clipId={}", request.getClipId(), e);
        }

        return ClipMoveResponse.builder()
                .clipId(request.getClipId())
                .before(ClipMoveResponse.ClipPosition.builder()
                        .trackId(beforeTrackId)
                        .startBar(beforeStartBar)
                        .build())
                .after(ClipMoveResponse.ClipPosition.builder()
                        .trackId(request.getTargetTrackId())
                        .startBar(request.getTargetStartBar())
                        .build())
                .build();
    }

    /*
        클립을 리사이징하는 메서드
     */
    public ClipResizeResponse resizeClip(ClipResizeRequest request, Integer userId) {
        request.validate();

        projectService.getProjectOrThrow(request.getProjectId());

        String lockKey = String.format(CLIP_LOCK_KEY, request.getProjectId(), request.getClipId());
        String currentLocker = redisTemplate.opsForValue().get(lockKey);
        if (!String.valueOf(userId).equals(currentLocker)) {
            throw new BusinessException(ErrorCode.CLIP_LOCKED);
        }

        ClipState state = getOrLoadClipState(request.getProjectId(), request.getClipId());

        Double beforeStart = state.getStart();
        Double beforeDuration = state.getDuration();

        ClipState updated = ClipState.builder()
                .clipId(state.getClipId())
                .trackId(state.getTrackId())
                .start(request.getStartBar())
                .duration(request.getLength())
                .build();
        saveClipStateToRedis(request.getProjectId(), updated);

        Long sequenceNo = redisTemplate.opsForValue()
                .increment(String.format(CLIP_EVENT_SEQ_KEY, request.getProjectId()));

        try {
            clipEventRepository.save(ClipResizeEventDocument.builder()
                    .event("CLIP_RESIZE")
                    .projectId(request.getProjectId())
                    .clipId(request.getClipId())
                    .userId(userId)
                    .sequenceNo(sequenceNo)
                    .timestamp(LocalDateTime.now())
                    .before(ClipResizeEventDocument.ClipSize.builder()
                            .startBar(beforeStart)
                            .length(beforeDuration)
                            .build())
                    .after(ClipResizeEventDocument.ClipSize.builder()
                            .startBar(request.getStartBar())
                            .length(request.getLength())
                            .build())
                    .undoable(true)
                    .undone(false)
                    .build());
        } catch (Exception e) {
            log.error("[MongoDB 이벤트 저장 실패]: event=CLIP_RESIZE, clipId={}", request.getClipId(), e);
        }

        return ClipResizeResponse.builder()
                .clipId(request.getClipId())
                .before(ClipResizeResponse.ClipSize.builder()
                        .startBar(beforeStart)
                        .length(beforeDuration)
                        .build())
                .after(ClipResizeResponse.ClipSize.builder()
                        .startBar(request.getStartBar())
                        .length(request.getLength())
                        .build())
                .build();
    }

    /*
        클립을 삭제하는 메서드
     */
    public ClipDeleteResponse deleteClip(ClipDeleteRequest request, Integer userId) {
        request.validate();

        projectService.getProjectOrThrow(request.getProjectId());

        String lockKey = String.format(CLIP_LOCK_KEY, request.getProjectId(), request.getClipId());
        String currentLocker = redisTemplate.opsForValue().get(lockKey);
        if (!String.valueOf(userId).equals(currentLocker)) {
            throw new BusinessException(ErrorCode.CLIP_LOCKED);
        }

        getOrLoadClipState(request.getProjectId(), request.getClipId());

        String stateKey = String.format(CLIP_STATE_KEY, request.getProjectId());
        redisTemplate.opsForHash().delete(stateKey, String.valueOf(request.getClipId()));
        redisTemplate.delete(lockKey);

        Long sequenceNo = redisTemplate.opsForValue()
                .increment(String.format(CLIP_EVENT_SEQ_KEY, request.getProjectId()));

        try {
            clipEventRepository.save(ClipDeleteEventDocument.builder()
                    .event("CLIP_DELETE")
                    .projectId(request.getProjectId())
                    .clipId(request.getClipId())
                    .userId(userId)
                    .sequenceNo(sequenceNo)
                    .timestamp(LocalDateTime.now())
                    .undoable(true)
                    .undone(false)
                    .build());
        } catch (Exception e) {
            log.error("[MongoDB 이벤트 저장 실패]: event=CLIP_DELETE, clipId={}", request.getClipId(), e);
        }

        return ClipDeleteResponse.builder()
                .clipId(request.getClipId())
                .build();
    }

    /*
        클립을 분할하는 메서드
        splitBar 위치를 기준으로 원본 클립의 duration을 줄이고, 나머지 구간을 새 클립으로 생성한다.
     */
    public ClipSplitResponse splitClip(ClipSplitRequest request, Integer userId) {
        request.validate();

        projectService.getProjectOrThrow(request.getProjectId());

        // 접근 권한 확인
        String lockKey = String.format(CLIP_LOCK_KEY, request.getProjectId(), request.getClipId());
        String currentLocker = redisTemplate.opsForValue().get(lockKey);
        if (!String.valueOf(userId).equals(currentLocker)) {
            throw new BusinessException(ErrorCode.CLIP_LOCKED);
        }

        ClipState original = getOrLoadClipState(request.getProjectId(), request.getClipId());

        Double originalStart = original.getStart();
        Double originalEnd = originalStart + original.getDuration();
        Double splitBar = request.getSplitBar();

        // 클립 영역 밖에서 split 요청 시 (정상적인 경우 실행되지 않지만 방어용으로 추가)
        if (splitBar <= originalStart || splitBar >= originalEnd) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }

        Integer newClipId = redisTemplate.opsForValue()
                .increment(String.format(CLIP_ID_SEQ_KEY, request.getProjectId())).intValue();

        // 기존 클립 수정 (split 기준 왼쪽이 기존 클립, 락은 기존 클립만 유지)
        Double newOriginalDuration = splitBar - originalStart;
        ClipState updatedOriginal = ClipState.builder()
                .clipId(original.getClipId())
                .trackId(original.getTrackId())
                .start(originalStart)
                .duration(newOriginalDuration)
                .build();
        saveClipStateToRedis(request.getProjectId(), updatedOriginal);

        // 새로운 클립 생성 (split 기준 오른쪽이 신규 클립)
        Double newClipDuration = originalEnd - splitBar;
        ClipState newClip = ClipState.builder()
                .clipId(newClipId)
                .trackId(original.getTrackId())
                .start(splitBar)
                .duration(newClipDuration)
                .build();
        saveClipStateToRedis(request.getProjectId(), newClip);

        Long sequenceNo = redisTemplate.opsForValue()
                .increment(String.format(CLIP_EVENT_SEQ_KEY, request.getProjectId()));

        // MongoDB에 이벤트 저장
        try {
            clipEventRepository.save(ClipSplitEventDocument.builder()
                    .event("CLIP_SPLIT")
                    .projectId(request.getProjectId())
                    .clipId(request.getClipId())
                    .userId(userId)
                    .sequenceNo(sequenceNo)
                    .timestamp(LocalDateTime.now())
                    .splitBar(splitBar)
                    .newClipId(newClipId)
                    .undoable(true)
                    .undone(false)
                    .build());
        } catch (Exception e) {
            log.error("[MongoDB 이벤트 저장 실패]: event=CLIP_SPLIT, clipId={}", request.getClipId(), e);
        }

        return ClipSplitResponse.builder()
                .clipId(request.getClipId())
                .splitBar(splitBar)
                .originalDuration(newOriginalDuration)
                .newClipId(newClipId)
                .newClipDuration(newClipDuration)
                .build();
    }

    /*
        클립을 오려두는 메서드
        타임라인에서 클립을 제거하고 클립보드(Redis)에 저장한다.
        MongoDB 로깅 없음 — 세션 종료 시 자동 Save로 RDB에 반영되므로 이벤트 재생 불필요
     */
    public ClipCutResponse cutClip(ClipCutRequest request, Integer userId) {
        request.validate();

        projectService.getProjectOrThrow(request.getProjectId());

        String lockKey = String.format(CLIP_LOCK_KEY, request.getProjectId(), request.getClipId());
        String currentLocker = redisTemplate.opsForValue().get(lockKey);
        if (!String.valueOf(userId).equals(currentLocker)) {
            throw new BusinessException(ErrorCode.CLIP_LOCKED);
        }

        ClipState state = getOrLoadClipState(request.getProjectId(), request.getClipId());

        String clipboardKey = String.format(CLIP_CLIPBOARD_KEY, request.getProjectId(), userId);
        String stateKey = String.format(CLIP_STATE_KEY, request.getProjectId());
        try {
            String clipboardValue = objectMapper.writeValueAsString(state);
            redisTemplate.execute(new SessionCallback<>() {
                @Override
                public Object execute(RedisOperations operations) {
                    operations.multi();
                    operations.opsForValue().set(clipboardKey, clipboardValue);
                    operations.opsForHash().delete(stateKey, String.valueOf(request.getClipId()));
                    operations.delete(lockKey);
                    return operations.exec();
                }
            });
        } catch (JsonProcessingException e) {
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR);
        }

        return ClipCutResponse.builder()
                .clipId(request.getClipId())
                .build();
    }

    /*
        클립을 복제하는 메서드
        원본 클립의 바로 뒤(같은 트랙)에 동일한 duration의 새 클립을 생성한다.
        복제 후 새 클립에 락이 이전되고, 원본 클립의 락은 해제된다.
     */
    public ClipDuplicateResponse duplicateClip(ClipDuplicateRequest request, Integer userId) {
        request.validate();

        projectService.getProjectOrThrow(request.getProjectId());

        String lockKey = String.format(CLIP_LOCK_KEY, request.getProjectId(), request.getClipId());
        String currentLocker = redisTemplate.opsForValue().get(lockKey);
        if (!String.valueOf(userId).equals(currentLocker)) {
            throw new BusinessException(ErrorCode.CLIP_LOCKED);
        }

        ClipState original = getOrLoadClipState(request.getProjectId(), request.getClipId());

        Integer targetTrackId = original.getTrackId();
        Double targetStartBar = original.getStart() + original.getDuration();

        Integer newClipId = redisTemplate.opsForValue()
                .increment(String.format(CLIP_ID_SEQ_KEY, request.getProjectId())).intValue();

        ClipState newClip = ClipState.builder()
                .clipId(newClipId)
                .trackId(targetTrackId)
                .start(targetStartBar)
                .duration(original.getDuration())
                .build();
        saveClipStateToRedis(request.getProjectId(), newClip);

        String newLockKey = String.format(CLIP_LOCK_KEY, request.getProjectId(), newClipId);
        String userIdStr = String.valueOf(userId);
        redisTemplate.execute(new SessionCallback<>() {
            @Override
            public Object execute(RedisOperations operations) {
                operations.multi();
                operations.delete(lockKey);
                operations.opsForValue().set(newLockKey, userIdStr);
                return operations.exec();
            }
        });

        Long sequenceNo = redisTemplate.opsForValue()
                .increment(String.format(CLIP_EVENT_SEQ_KEY, request.getProjectId()));

        try {
            clipEventRepository.save(ClipDuplicateEventDocument.builder()
                    .event("CLIP_DUPLICATE")
                    .projectId(request.getProjectId())
                    .clipId(request.getClipId())
                    .userId(userId)
                    .sequenceNo(sequenceNo)
                    .timestamp(LocalDateTime.now())
                    .newClipId(newClipId)
                    .targetTrackId(targetTrackId)
                    .targetStartBar(targetStartBar)
                    .undoable(true)
                    .undone(false)
                    .build());
        } catch (Exception e) {
            log.error("[MongoDB 이벤트 저장 실패]: event=CLIP_DUPLICATE, clipId={}", request.getClipId(), e);
        }

        return ClipDuplicateResponse.builder()
                .clipId(request.getClipId())
                .newClipId(newClipId)
                .targetTrackId(targetTrackId)
                .targetStartBar(targetStartBar)
                .build();
    }

    private ClipState getOrLoadClipState(Integer projectId, Integer clipId) {
        String key = String.format(CLIP_STATE_KEY, projectId);
        String json = (String) redisTemplate.opsForHash().get(key, String.valueOf(clipId));
        if (json != null) {
            try {
                return objectMapper.readValue(json, ClipState.class);
            } catch (JsonProcessingException e) {
                throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR);
            }
        }
        Clip clip = clipRepository.findById(clipId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CLIP_NOT_FOUND));
        ClipState state = ClipState.builder()
                .clipId(clip.getId())
                .trackId(clip.getTrack().getId())
                .start(clip.getStart())
                .duration(clip.getDuration())
                .build();
        saveClipStateToRedis(projectId, state);
        return state;
    }

    private void saveClipStateToRedis(Integer projectId, ClipState state) {
        try {
            String key = String.format(CLIP_STATE_KEY, projectId);
            String value = objectMapper.writeValueAsString(state);
            redisTemplate.opsForHash().put(key, String.valueOf(state.getClipId()), value);
        } catch (JsonProcessingException e) {
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR);
        }
    }

    public List<Clip> getClipsWithAudioMetadataByTrackIds(List<Integer> trackIds) {
        if (trackIds == null || trackIds.isEmpty()) {
            return List.of();
        }

        return clipRepository.findAllWithAudioMetadataByTrackIds(trackIds);
    }
}
