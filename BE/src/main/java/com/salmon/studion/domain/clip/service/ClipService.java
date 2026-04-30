package com.salmon.studion.domain.clip.service;

import com.salmon.studion.domain.clip.dto.request.ClipLockRequest;
import com.salmon.studion.domain.clip.dto.response.ClipLockResponse;
import com.salmon.studion.domain.clip.entity.Clip;
import com.salmon.studion.domain.clip.entity.ClipLockEventDocument;
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

    private final ProjectService projectService;
    private final ClipRepository clipRepository;
    private final ClipEventRepository clipEventRepository;
    private final RedisTemplate<String, String> redisTemplate;

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

    public List<Clip> getClipsWithAudioMetadataByTrackIds(List<Integer> trackIds) {
        if (trackIds == null || trackIds.isEmpty()) {
            return List.of();
        }

        return clipRepository.findAllWithAudioMetadataByTrackIds(trackIds);
    }
}
