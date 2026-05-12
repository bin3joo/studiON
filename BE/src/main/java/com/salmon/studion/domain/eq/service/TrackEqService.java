package com.salmon.studion.domain.eq.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.salmon.studion.domain.eq.dto.TrackEqDraftState;
import com.salmon.studion.domain.eq.dto.request.TrackEqCommitRequest;
import com.salmon.studion.domain.eq.dto.request.TrackEqDraftSaveRequest;
import com.salmon.studion.domain.eq.dto.request.TrackEqLockRequest;
import com.salmon.studion.domain.eq.dto.request.TrackEqResetRequest;
import com.salmon.studion.domain.eq.dto.response.TrackEqListResponse;
import com.salmon.studion.domain.eq.dto.response.TrackEqLockResponse;
import com.salmon.studion.domain.eq.entity.TrackEq;
import com.salmon.studion.domain.eq.repository.TrackEqBandRepository;
import com.salmon.studion.domain.eq.repository.TrackEqRepository;
import com.salmon.studion.domain.eq.support.TrackEqRedisKeys;
import com.salmon.studion.domain.project.service.ProjectMemberService;
import com.salmon.studion.domain.project.service.ProjectService;
import com.salmon.studion.global.common.response.ErrorCode;
import com.salmon.studion.global.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
public class TrackEqService {

    private final TrackEqRepository trackEqRepository;
    private final TrackEqBandRepository trackEqBandRepository;
    private final ProjectService projectService;
    private final ProjectMemberService projectMemberService;
    private final RedisTemplate<String, String> redisTemplate;
    private final TrackEqBandService trackEqBandService;
    private final ObjectMapper objectMapper;

    public TrackEqListResponse getProjectTrackEqList(Integer projectId, Integer userId) {
        projectService.getProjectOrThrow(projectId);
        projectMemberService.validateProjectMember(projectId, userId);

        List<TrackEq> trackEqs = trackEqRepository.findByProjectId(projectId);

        return TrackEqListResponse.builder()
                .trackEqs(trackEqs.stream()
                        .map(trackEq -> new TrackEqListResponse.TrackEqSummary(
                                trackEq.getId(),
                                trackEq.getTrackId(),
                                trackEq.getProjectId()
                        ))
                        .toList())
                .build();
    }

    public TrackEq getTrackEqOrThrow(Integer trackEqId) {
        return trackEqRepository.findById(trackEqId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TRACK_EQ_NOT_FOUND));
    }

    public TrackEqLockResponse lockTrackEq(TrackEqLockRequest request, Integer userId) {
        request.validate();

        TrackEq trackEq = getAuthorizedTrackEq(request.getProjectId(), request.getTrackEqId(), userId);
        String lockKey = TrackEqRedisKeys.lockKey(request.getProjectId(), request.getTrackEqId());

        if (request.getIsLocked()) {
            Boolean acquired = redisTemplate.opsForValue().setIfAbsent(
                    lockKey,
                    String.valueOf(userId),
                    TrackEqRedisKeys.LOCK_TTL_SECONDS,
                    TimeUnit.SECONDS
            );
            if (Boolean.FALSE.equals(acquired)) {
                String currentLocker = redisTemplate.opsForValue().get(lockKey);
                if (!String.valueOf(userId).equals(currentLocker)) {
                    throw new BusinessException(ErrorCode.TRACK_EQ_LOCKED);
                }
                refreshLockTtl(lockKey);
            }
        } else {
            String currentLocker = redisTemplate.opsForValue().get(lockKey);
            if (currentLocker != null && !currentLocker.equals(String.valueOf(userId))) {
                throw new BusinessException(ErrorCode.TRACK_EQ_LOCKED);
            }
            redisTemplate.delete(lockKey);
        }

        return TrackEqLockResponse.builder()
                .trackEqId(trackEq.getId())
                .isLocked(request.getIsLocked())
                .userId(userId)
                .build();
    }

    public TrackEqDraftState saveDraft(TrackEqDraftSaveRequest request, Integer userId) {
        request.validate();

        TrackEq trackEq = getAuthorizedTrackEq(request.getProjectId(), request.getTrackEqId(), userId);
        validateBands(request.getBands());

        validateOwnedLockAndRefreshTtl(trackEq.getProjectId(), trackEq.getId(), userId);
        TrackEqDraftState currentDraft = getDraftState(trackEq.getProjectId(), trackEq.getId());
        TrackEqDraftState nextDraft = TrackEqDraftState.builder()
                .projectId(trackEq.getProjectId())
                .trackEqId(trackEq.getId())
                .updatedBy(userId)
                .updatedAt(LocalDateTime.now())
                .version(nextVersion(currentDraft))
                .bands(request.getBands().stream()
                        .map(band -> TrackEqDraftState.DraftBand.builder()
                                .bandOrder(band.getBandOrder())
                                .eqType(band.getEqType())
                                .frequencyHz(band.getFrequencyHz())
                                .q(band.getQ())
                                .gainDeltaDb(band.getGainDeltaDb())
                                .sourceType(band.getSourceType())
                                .build())
                        .toList())
                .build();

        saveDraftState(nextDraft);
        return nextDraft;
    }

    public TrackEqDraftState resetDraft(TrackEqResetRequest request, Integer userId) {
        request.validate();

        TrackEq trackEq = getAuthorizedTrackEq(request.getProjectId(), request.getTrackEqId(), userId);
        validateOwnedLockAndRefreshTtl(trackEq.getProjectId(), trackEq.getId(), userId);
        TrackEqDraftState currentDraft = getDraftState(trackEq.getProjectId(), trackEq.getId());

        TrackEqDraftState resetDraft = TrackEqDraftState.builder()
                .projectId(trackEq.getProjectId())
                .trackEqId(trackEq.getId())
                .updatedBy(userId)
                .updatedAt(LocalDateTime.now())
                .version(nextVersion(currentDraft))
                .bands(List.of())
                .build();

        saveDraftState(resetDraft);
        return resetDraft;
    }

    @Transactional
    public TrackEqDraftState commitDraft(TrackEqCommitRequest request, Integer userId) {
        request.validate();

        TrackEq trackEq = getAuthorizedTrackEq(request.getProjectId(), request.getTrackEqId(), userId);
        String lockKey = validateOwnedLockAndRefreshTtl(trackEq.getProjectId(), trackEq.getId(), userId);
        TrackEqDraftState draftState = getDraftState(trackEq.getProjectId(), trackEq.getId());

        if (draftState == null) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST, "저장할 EQ draft가 없습니다.");
        }

        validateDraftBands(draftState.getBands());
        trackEqBandService.replaceTrackEqBandsFromDraft(trackEq.getId(), userId, draftState.getBands());

        redisTemplate.delete(TrackEqRedisKeys.draftKey(trackEq.getProjectId(), trackEq.getId()));
        redisTemplate.delete(lockKey);

        return draftState;
    }

    public void createIfAbsent(Integer trackId, Integer projectId) {
        if (trackEqRepository.existsByTrackId(trackId)) {
            return;
        }

        TrackEq trackEq = TrackEq.create(trackId, projectId);
        trackEqRepository.save(trackEq);
    }

    @Transactional
    public void deleteByTrackId(Integer trackId) {
        trackEqRepository.findByTrackId(trackId).ifPresent(trackEq -> {
            trackEqBandRepository.deleteAllByTrackEq_Id(trackEq.getId());
            redisTemplate.delete(TrackEqRedisKeys.lockKey(trackEq.getProjectId(), trackEq.getId()));
            redisTemplate.delete(TrackEqRedisKeys.draftKey(trackEq.getProjectId(), trackEq.getId()));
            trackEqRepository.delete(trackEq);
        });
    }

    private void validateBands(List<com.salmon.studion.domain.eq.dto.request.BandRequest> bands) {
        if (bands.size() > 5) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "EQ 밴드는 최대 5개까지 저장할 수 있습니다.");
        }

        Set<Integer> bandOrders = new HashSet<>();
        for (com.salmon.studion.domain.eq.dto.request.BandRequest band : bands) {
            if (!bandOrders.add(band.getBandOrder())) {
                throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "EQ bandOrder는 중복될 수 없습니다.");
            }
        }
    }

    private void validateDraftBands(List<TrackEqDraftState.DraftBand> bands) {
        if (bands.size() > 5) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "EQ 밴드는 최대 5개까지 저장할 수 있습니다.");
        }

        Set<Integer> bandOrders = new HashSet<>();
        for (TrackEqDraftState.DraftBand band : bands) {
            if (!bandOrders.add(band.getBandOrder())) {
                throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "EQ bandOrder는 중복될 수 없습니다.");
            }
        }
    }

    private String validateOwnedLockAndRefreshTtl(Integer projectId, Integer trackEqId, Integer userId) {
        String lockKey = TrackEqRedisKeys.lockKey(projectId, trackEqId);
        String currentLocker = redisTemplate.opsForValue().get(lockKey);

        if (!String.valueOf(userId).equals(currentLocker)) {
            throw new BusinessException(ErrorCode.TRACK_EQ_LOCKED);
        }

        refreshLockTtl(lockKey);
        return lockKey;
    }

    private void refreshLockTtl(String lockKey) {
        redisTemplate.expire(lockKey, TrackEqRedisKeys.LOCK_TTL_SECONDS, TimeUnit.SECONDS);
    }

    private TrackEqDraftState getDraftState(Integer projectId, Integer trackEqId) {
        String draftKey = TrackEqRedisKeys.draftKey(projectId, trackEqId);
        String value = redisTemplate.opsForValue().get(draftKey);
        if (value == null || value.isBlank()) {
            return null;
        }

        try {
            return objectMapper.readValue(value, TrackEqDraftState.class);
        } catch (JsonProcessingException e) {
            throw new BusinessException(ErrorCode.FAIL, "EQ draft 역직렬화에 실패했습니다.");
        }
    }

    private void saveDraftState(TrackEqDraftState draftState) {
        try {
            redisTemplate.opsForValue().set(
                    TrackEqRedisKeys.draftKey(draftState.getProjectId(), draftState.getTrackEqId()),
                    objectMapper.writeValueAsString(draftState),
                    TrackEqRedisKeys.DRAFT_TTL_SECONDS,
                    TimeUnit.SECONDS
            );
        } catch (JsonProcessingException e) {
            throw new BusinessException(ErrorCode.FAIL, "EQ draft 직렬화에 실패했습니다.");
        }
    }

    private long nextVersion(TrackEqDraftState currentDraft) {
        if (currentDraft == null || currentDraft.getVersion() == null) {
            return 1L;
        }
        return currentDraft.getVersion() + 1L;
    }

    private TrackEq getAuthorizedTrackEq(Integer projectId, Integer trackEqId, Integer userId) {
        projectService.getProjectOrThrow(projectId);

        TrackEq trackEq = getTrackEqOrThrow(trackEqId);
        if (!trackEq.getProjectId().equals(projectId)) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }

        projectMemberService.validateProjectMember(projectId, userId);
        return trackEq;
    }
}
