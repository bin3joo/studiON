package com.salmon.studion.domain.clip.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.salmon.studion.domain.clip.dto.ClipState;
import com.salmon.studion.domain.clip.dto.request.ClipLockRequest;
import com.salmon.studion.domain.clip.dto.request.ClipMoveRequest;
import com.salmon.studion.domain.clip.dto.request.ClipResizeRequest;
import com.salmon.studion.domain.clip.dto.response.ClipLockResponse;
import com.salmon.studion.domain.clip.dto.response.ClipMoveResponse;
import com.salmon.studion.domain.clip.dto.response.ClipResizeResponse;
import com.salmon.studion.domain.clip.entity.Clip;
import com.salmon.studion.domain.clip.entity.ClipLockEventDocument;
import com.salmon.studion.domain.clip.entity.ClipMoveEventDocument;
import com.salmon.studion.domain.clip.entity.ClipResizeEventDocument;
import com.salmon.studion.domain.clip.repository.ClipEventRepository;
import com.salmon.studion.domain.clip.repository.ClipRepository;
import com.salmon.studion.domain.project.service.ProjectService;
import com.salmon.studion.global.common.response.ErrorCode;
import com.salmon.studion.global.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
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

    private final ProjectService projectService;
    private final ClipRepository clipRepository;
    private final ClipEventRepository clipEventRepository;
    private final RedisTemplate<String, String> redisTemplate;
    private final ObjectMapper objectMapper;

    /*
        Clip Lock 실행/해제
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
        Clip 이동 기능 구현
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
