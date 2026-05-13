package com.salmon.studion.domain.limiter.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.salmon.studion.domain.ai.dto.request.ProjectMasterLimiterRequest;
import com.salmon.studion.domain.limiter.dto.MasterLimiterCurrentState;
import com.salmon.studion.domain.limiter.dto.MasterLimiterDraftState;
import com.salmon.studion.domain.limiter.dto.request.MasterLimiterCommitRequest;
import com.salmon.studion.domain.limiter.dto.request.MasterLimiterDraftSaveRequest;
import com.salmon.studion.domain.limiter.dto.request.MasterLimiterLockRequest;
import com.salmon.studion.domain.limiter.dto.request.MasterLimiterResetRequest;
import com.salmon.studion.domain.limiter.dto.response.MasterLimiterLockResponse;
import com.salmon.studion.domain.limiter.entity.MasterLimiter;
import com.salmon.studion.domain.limiter.repository.MasterLimiterRepository;
import com.salmon.studion.domain.limiter.support.LimiterRedisKeys;
import com.salmon.studion.domain.project.service.ProjectMemberService;
import com.salmon.studion.domain.project.service.ProjectService;
import com.salmon.studion.global.common.response.ErrorCode;
import com.salmon.studion.global.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Set;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
public class MasterLimiterService {

    private static final Set<String> ALLOWED_SOURCE_TYPES = Set.of("MANUAL", "AI_SUGGESTION", "AI_APPLIED");

    private final MasterLimiterRepository masterLimiterRepository;
    private final ProjectService projectService;
    private final ProjectMemberService projectMemberService;
    private final RedisTemplate<String, String> redisTemplate;
    private final ObjectMapper objectMapper;

    @Transactional
    public MasterLimiterCurrentState getProjectMasterLimiter(Integer projectId, Integer userId) {
        projectService.getProjectOrThrow(projectId);
        projectMemberService.validateProjectMember(projectId, userId);
        return getOrHydrateCurrentState(projectId);
    }

    @Transactional
    public MasterLimiterCurrentState getCurrentState(Integer projectId) {
        projectService.getProjectOrThrow(projectId);
        return getOrHydrateCurrentState(projectId);
    }

    @Transactional
    public MasterLimiterLockResponse lockMasterLimiter(MasterLimiterLockRequest request, Integer userId) {
        request.validate();
        MasterLimiter limiter = getAuthorizedLimiter(request.getProjectId(), userId);
        String lockKey = LimiterRedisKeys.lockKey(request.getProjectId());

        if (request.getIsLocked()) {
            Boolean acquired = redisTemplate.opsForValue().setIfAbsent(
                    lockKey,
                    String.valueOf(userId),
                    LimiterRedisKeys.LOCK_TTL_SECONDS,
                    TimeUnit.SECONDS
            );
            if (Boolean.FALSE.equals(acquired)) {
                String currentLocker = redisTemplate.opsForValue().get(lockKey);
                if (!String.valueOf(userId).equals(currentLocker)) {
                    throw new BusinessException(ErrorCode.MASTER_LIMITER_LOCKED);
                }
                refreshLockTtl(lockKey);
            }
        } else {
            String currentLocker = redisTemplate.opsForValue().get(lockKey);
            if (currentLocker != null && !String.valueOf(userId).equals(currentLocker)) {
                throw new BusinessException(ErrorCode.MASTER_LIMITER_LOCKED);
            }
            redisTemplate.delete(lockKey);
        }

        return MasterLimiterLockResponse.builder()
                .masterLimiterId(limiter.getId())
                .isLocked(request.getIsLocked())
                .userId(userId)
                .build();
    }

    @Transactional
    public MasterLimiterDraftState saveDraft(MasterLimiterDraftSaveRequest request, Integer userId) {
        request.validate();
        MasterLimiter limiter = getAuthorizedLimiter(request.getProjectId(), userId);
        validateOwnedLockAndRefreshTtl(request.getProjectId(), userId);
        validateLimiterValues(
                request.getThresholdDb(),
                request.getCeilingDbfs(),
                request.getAttackMs(),
                request.getReleaseMs(),
                request.getInputGainDb(),
                request.getMakeupGainDb(),
                request.getSourceType()
        );

        MasterLimiterDraftState currentDraft = getDraftState(request.getProjectId());
        MasterLimiterDraftState nextDraft = MasterLimiterDraftState.builder()
                .projectId(request.getProjectId())
                .masterLimiterId(limiter.getId())
                .updatedBy(userId)
                .updatedAt(LocalDateTime.now())
                .version(nextVersion(currentDraft))
                .isEnabled(request.getIsEnabled())
                .thresholdDb(request.getThresholdDb())
                .ceilingDbfs(request.getCeilingDbfs())
                .attackMs(request.getAttackMs())
                .releaseMs(request.getReleaseMs())
                .inputGainDb(request.getInputGainDb())
                .makeupGainDb(request.getMakeupGainDb())
                .jobId(request.getJobId())
                .suggestionActionId(request.getSuggestionActionId())
                .appliedSuggestionId(request.getAppliedSuggestionId())
                .sourceType(request.getSourceType())
                .build();

        saveDraftState(nextDraft);
        saveCurrentState(buildDraftCurrentState(limiter, nextDraft));
        return nextDraft;
    }

    @Transactional
    public MasterLimiterCurrentState resetDraft(MasterLimiterResetRequest request, Integer userId) {
        request.validate();
        MasterLimiter limiter = getAuthorizedLimiter(request.getProjectId(), userId);
        validateOwnedLockAndRefreshTtl(request.getProjectId(), userId);

        MasterLimiterCurrentState resetState = buildCommittedCurrentState(limiter);
        redisTemplate.delete(LimiterRedisKeys.draftKey(request.getProjectId()));
        saveCurrentState(resetState);
        return resetState;
    }

    @Transactional
    public MasterLimiterCurrentState commitDraft(MasterLimiterCommitRequest request, Integer userId) {
        request.validate();
        MasterLimiter limiter = getAuthorizedLimiter(request.getProjectId(), userId);
        String lockKey = validateOwnedLockAndRefreshTtl(request.getProjectId(), userId);
        MasterLimiterDraftState draftState = getDraftState(request.getProjectId());

        if (draftState == null) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST, "저장할 limiter draft가 없습니다.");
        }

        validateLimiterValues(
                draftState.getThresholdDb(),
                draftState.getCeilingDbfs(),
                draftState.getAttackMs(),
                draftState.getReleaseMs(),
                draftState.getInputGainDb(),
                draftState.getMakeupGainDb(),
                draftState.getSourceType()
        );

        limiter.update(
                draftState.getIsEnabled(),
                draftState.getThresholdDb(),
                draftState.getCeilingDbfs(),
                draftState.getAttackMs(),
                draftState.getReleaseMs(),
                draftState.getInputGainDb(),
                draftState.getMakeupGainDb(),
                draftState.getJobId(),
                draftState.getSuggestionActionId(),
                draftState.getAppliedSuggestionId(),
                toSourceTypeCode(draftState.getSourceType())
        );
        MasterLimiter saved = masterLimiterRepository.save(limiter);
        MasterLimiterCurrentState committedState = buildCommittedCurrentState(saved);
        saveCurrentState(committedState);

        redisTemplate.delete(LimiterRedisKeys.draftKey(request.getProjectId()));
        redisTemplate.delete(lockKey);
        return committedState;
    }

    @Transactional
    public MasterLimiter createIfAbsent(Integer projectId) {
        return masterLimiterRepository.findByProjectId(projectId)
                .orElseGet(() -> {
                    MasterLimiter created = masterLimiterRepository.save(MasterLimiter.create(projectId));
                    saveCurrentState(buildCommittedCurrentState(created));
                    return created;
                });
    }

    @Transactional
    public ProjectMasterLimiterRequest getCurrentMasterLimiterPayload(Integer projectId) {
        MasterLimiterCurrentState state = getOrHydrateCurrentState(projectId);
        return ProjectMasterLimiterRequest.create(
                state.getIsEnabled(),
                state.getThresholdDb(),
                state.getCeilingDbfs(),
                state.getAttackMs(),
                state.getReleaseMs(),
                state.getInputGainDb(),
                state.getMakeupGainDb()
        );
    }

    private MasterLimiter getAuthorizedLimiter(Integer projectId, Integer userId) {
        projectService.getProjectOrThrow(projectId);
        projectMemberService.validateProjectMember(projectId, userId);
        return createIfAbsent(projectId);
    }

    private String validateOwnedLockAndRefreshTtl(Integer projectId, Integer userId) {
        String lockKey = LimiterRedisKeys.lockKey(projectId);
        String currentLocker = redisTemplate.opsForValue().get(lockKey);

        if (!String.valueOf(userId).equals(currentLocker)) {
            throw new BusinessException(ErrorCode.MASTER_LIMITER_LOCKED);
        }

        refreshLockTtl(lockKey);
        return lockKey;
    }

    private void refreshLockTtl(String lockKey) {
        redisTemplate.expire(lockKey, LimiterRedisKeys.LOCK_TTL_SECONDS, TimeUnit.SECONDS);
    }

    private MasterLimiterCurrentState getOrHydrateCurrentState(Integer projectId) {
        String currentKey = LimiterRedisKeys.currentKey(projectId);
        String cached = redisTemplate.opsForValue().get(currentKey);
        if (cached != null && !cached.isBlank()) {
            return readCurrentState(cached);
        }
        return hydrateCurrentState(projectId);
    }

    private MasterLimiterCurrentState hydrateCurrentState(Integer projectId) {
        MasterLimiter limiter = createIfAbsent(projectId);
        MasterLimiterCurrentState currentState = buildCommittedCurrentState(limiter);
        saveCurrentState(currentState);
        return currentState;
    }

    private MasterLimiterDraftState getDraftState(Integer projectId) {
        String value = redisTemplate.opsForValue().get(LimiterRedisKeys.draftKey(projectId));
        if (value == null || value.isBlank()) {
            return null;
        }

        try {
            return objectMapper.readValue(value, MasterLimiterDraftState.class);
        } catch (JsonProcessingException e) {
            throw new BusinessException(ErrorCode.FAIL, "Limiter draft 역직렬화에 실패했습니다.");
        }
    }

    private void saveDraftState(MasterLimiterDraftState draftState) {
        try {
            redisTemplate.opsForValue().set(
                    LimiterRedisKeys.draftKey(draftState.getProjectId()),
                    objectMapper.writeValueAsString(draftState),
                    LimiterRedisKeys.DRAFT_TTL_SECONDS,
                    TimeUnit.SECONDS
            );
        } catch (JsonProcessingException e) {
            throw new BusinessException(ErrorCode.FAIL, "Limiter draft 직렬화에 실패했습니다.");
        }
    }

    private MasterLimiterCurrentState readCurrentState(String value) {
        try {
            return objectMapper.readValue(value, MasterLimiterCurrentState.class);
        } catch (JsonProcessingException e) {
            throw new BusinessException(ErrorCode.FAIL, "Limiter current projection 역직렬화에 실패했습니다.");
        }
    }

    private void saveCurrentState(MasterLimiterCurrentState currentState) {
        try {
            redisTemplate.opsForValue().set(
                    LimiterRedisKeys.currentKey(currentState.getProjectId()),
                    objectMapper.writeValueAsString(currentState)
            );
        } catch (JsonProcessingException e) {
            throw new BusinessException(ErrorCode.FAIL, "Limiter current projection 직렬화에 실패했습니다.");
        }
    }

    private MasterLimiterCurrentState buildDraftCurrentState(
            MasterLimiter limiter,
            MasterLimiterDraftState draftState
    ) {
        return MasterLimiterCurrentState.builder()
                .projectId(limiter.getProjectId())
                .masterLimiterId(limiter.getId())
                .updatedAt(draftState.getUpdatedAt() != null ? draftState.getUpdatedAt() : LocalDateTime.now())
                .source("DRAFT")
                .isEnabled(draftState.getIsEnabled())
                .thresholdDb(draftState.getThresholdDb())
                .ceilingDbfs(draftState.getCeilingDbfs())
                .attackMs(draftState.getAttackMs())
                .releaseMs(draftState.getReleaseMs())
                .inputGainDb(draftState.getInputGainDb())
                .makeupGainDb(draftState.getMakeupGainDb())
                .jobId(draftState.getJobId())
                .suggestionActionId(draftState.getSuggestionActionId())
                .appliedSuggestionId(draftState.getAppliedSuggestionId())
                .sourceType(draftState.getSourceType())
                .build();
    }

    private MasterLimiterCurrentState buildCommittedCurrentState(MasterLimiter limiter) {
        return MasterLimiterCurrentState.builder()
                .projectId(limiter.getProjectId())
                .masterLimiterId(limiter.getId())
                .updatedAt(LocalDateTime.now())
                .source("COMMITTED")
                .isEnabled(limiter.getIsEnabled())
                .thresholdDb(limiter.getThresholdDb())
                .ceilingDbfs(limiter.getCeilingDbfs())
                .attackMs(limiter.getAttackMs())
                .releaseMs(limiter.getReleaseMs())
                .inputGainDb(limiter.getInputGainDb())
                .makeupGainDb(limiter.getMakeupGainDb())
                .jobId(limiter.getJobId())
                .suggestionActionId(limiter.getSuggestionActionId())
                .appliedSuggestionId(limiter.getAppliedSuggestionId())
                .sourceType(toSourceType(limiter.getSourceTypeCode()))
                .build();
    }

    private void validateLimiterValues(
            Double thresholdDb,
            Double ceilingDbfs,
            Double attackMs,
            Double releaseMs,
            Double inputGainDb,
            Double makeupGainDb,
            String sourceType
    ) {
        if (thresholdDb < -24.0 || thresholdDb > 0.0) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "thresholdDb 범위가 올바르지 않습니다.");
        }
        if (ceilingDbfs < -3.0 || ceilingDbfs > 0.0) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "ceilingDbfs 범위가 올바르지 않습니다.");
        }
        if (attackMs < 0.1 || attackMs > 100.0) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "attackMs 범위가 올바르지 않습니다.");
        }
        if (releaseMs < 5.0 || releaseMs > 1000.0) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "releaseMs 범위가 올바르지 않습니다.");
        }
        if (inputGainDb < -12.0 || inputGainDb > 12.0) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "inputGainDb 범위가 올바르지 않습니다.");
        }
        if (makeupGainDb < -12.0 || makeupGainDb > 12.0) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "makeupGainDb 범위가 올바르지 않습니다.");
        }
        if (!ALLOWED_SOURCE_TYPES.contains(sourceType)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "sourceType 값이 올바르지 않습니다.");
        }
    }

    private long nextVersion(MasterLimiterDraftState currentDraft) {
        if (currentDraft == null || currentDraft.getVersion() == null) {
            return 1L;
        }
        return currentDraft.getVersion() + 1L;
    }

    private String toSourceType(Integer sourceTypeCode) {
        if (sourceTypeCode == null) {
            return null;
        }
        return switch (sourceTypeCode) {
            case 1 -> "MANUAL";
            case 2 -> "AI_SUGGESTION";
            case 3 -> "AI_APPLIED";
            default -> throw new BusinessException(ErrorCode.FAIL, "알 수 없는 limiter source type code 입니다. code=" + sourceTypeCode);
        };
    }

    private Integer toSourceTypeCode(String sourceType) {
        return switch (sourceType) {
            case "MANUAL" -> 1;
            case "AI_SUGGESTION" -> 2;
            case "AI_APPLIED" -> 3;
            default -> throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "sourceType 값이 올바르지 않습니다.");
        };
    }
}
