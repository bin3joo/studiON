package com.salmon.studion.domain.track.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.salmon.studion.domain.project.service.ProjectService;
import com.salmon.studion.domain.track.dto.TrackState;
import com.salmon.studion.domain.track.dto.request.TrackAddRequest;
import com.salmon.studion.domain.track.dto.request.TrackRemoveRequest;
import com.salmon.studion.domain.track.dto.request.TrackRenameRequest;
import com.salmon.studion.domain.track.dto.request.TrackReorderRequest;
import com.salmon.studion.domain.track.dto.response.TrackAddResponse;
import com.salmon.studion.domain.track.dto.response.TrackRemoveResponse;
import com.salmon.studion.domain.track.dto.response.TrackRenameResponse;
import com.salmon.studion.domain.track.dto.response.TrackReorderResponse;
import com.salmon.studion.domain.track.entity.Track;
import com.salmon.studion.domain.track.entity.TrackEventDocument;
import com.salmon.studion.domain.track.entity.TrackRenameEventDocument;
import com.salmon.studion.domain.track.entity.TrackReorderEventDocument;
import com.salmon.studion.domain.track.repository.TrackEventRepository;
import com.salmon.studion.domain.track.repository.TrackRepository;
import com.salmon.studion.global.common.response.ErrorCode;
import com.salmon.studion.global.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class TrackService {

    private static final String TRACKS_KEY = "project:%d:tracks";
    private static final String TRACK_ID_SEQ_KEY = "project:%d:track:id_seq";
    private static final String EVENT_SEQ_KEY = "project:%d:event:seq";

    private final ProjectService projectService;
    private final TrackRepository trackRepository;
    private final TrackEventRepository trackEventRepository;
    private final RedisTemplate<String, String> redisTemplate;
    private final ObjectMapper objectMapper;

    /*
        트랙을 추가하는 메서드
        현재는 가장 하단에 추가하는 것으로 고정
        추후 변경 가능하도록 구현
     */
    public TrackAddResponse addTrack(TrackAddRequest request, Integer userId) {
        // 입력값 null 여부 검증
        request.validate();

        // 프로젝트 존재여부 확인
        projectService.getProjectOrThrow(request.getProjectId());

        Integer newTrackId = redisTemplate.opsForValue()
                .increment(String.format(TRACK_ID_SEQ_KEY, request.getProjectId())).intValue();

        Integer lastTrackId = findLastTrackId(request.getProjectId());
        if (lastTrackId != null) {
            updatePostTrackId(request.getProjectId(), lastTrackId, newTrackId);
        }

        TrackState newTrack = TrackState.builder()
                .trackId(newTrackId)
                .name(request.getName())
                .type(request.getType().toLowerCase())
                .preTrackId(lastTrackId)
                .postTrackId(null)
                .isMuted(false)
                .isSoloed(false)
                .volume(0.0)
                .pan(0)
                .build();

        saveTrackToRedis(request.getProjectId(), newTrack);

        Long sequenceNo = redisTemplate.opsForValue()
                .increment(String.format(EVENT_SEQ_KEY, request.getProjectId()));

        // 저장 실패 시에도 브로드캐스트는 진행
        try {
            saveTrackAddOrDeleteEvent(
                    "TRACK_ADD",
                    request.getProjectId(),
                    newTrackId,
                    userId,
                    sequenceNo,
                    lastTrackId,
                    null);
        } catch (Exception e) {
            log.error("[MongoDB 이벤트 저장 실패]: event=TRACK_ADD, trackId={}", newTrackId, e);
        }

        return TrackAddResponse.builder()
                .trackId(newTrackId)
                .name(newTrack.getName())
                .type(newTrack.getType())
                .preTrackId(lastTrackId)
                .postTrackId(null)
                .isMuted(false)
                .isSoloed(false)
                .volume(0.0)
                .pan(0)
                .build();
    }

    /*
        트랙을 삭제하는 메서드
     */
    public TrackRemoveResponse removeTrack(TrackRemoveRequest request, Integer userId) {
        request.validate();

        projectService.getProjectOrThrow(request.getProjectId());

        TrackState track = findTrack(request.getProjectId(), request.getTrackId());

        if (track.getPreTrackId() != null) {
            updatePostTrackId(request.getProjectId(), track.getPreTrackId(), track.getPostTrackId());
        }
        if (track.getPostTrackId() != null) {
            updatePreTrackId(request.getProjectId(), track.getPostTrackId(), track.getPreTrackId());
        }

        removeTrackToRedis(request.getProjectId(), track);

        Long sequenceNo = redisTemplate.opsForValue()
                .increment(String.format(EVENT_SEQ_KEY, request.getProjectId()));

        // 저장 실패 시에도 브로드캐스트는 진행
        try {
            saveTrackAddOrDeleteEvent(
                    "TRACK_DELETE",
                    request.getProjectId(),
                    request.getTrackId(),
                    userId,
                    sequenceNo,
                    track.getPreTrackId(),
                    track.getPostTrackId()
            );
        } catch (Exception e) {
            log.error("[MongoDB 이벤트 저장 실패]: event=TRACK_DELETE, trackId={}", request.getTrackId(), e);
        }

        return TrackRemoveResponse.builder()
                .trackId(track.getTrackId())
                .preTrackId(track.getPreTrackId())
                .postTrackId(track.getPostTrackId())
                .build();
    }

    /*
        트랙의 순서를 변경하는 메서드
     */
    public TrackReorderResponse reorderTrack(TrackReorderRequest request, Integer userId) {
        request.validate();

        projectService.getProjectOrThrow(request.getProjectId());

        TrackState track = findTrack(request.getProjectId(), request.getTrackId());

        Integer beforePreTrackId = track.getPreTrackId();
        Integer beforePostTrackId = track.getPostTrackId();

        // 기존 위치에서 끊기
        if (beforePreTrackId != null) {
            updatePostTrackId(request.getProjectId(), beforePreTrackId, beforePostTrackId);
        }
        if (beforePostTrackId != null) {
            updatePreTrackId(request.getProjectId(), beforePostTrackId, beforePreTrackId);
        }

        // 새 위치에서 연결
        if (request.getTargetPreTrackId() != null) {
            updatePostTrackId(request.getProjectId(), request.getTargetPreTrackId(), request.getTrackId());
        }
        if (request.getTargetPostTrackId() != null) {
            updatePreTrackId(request.getProjectId(), request.getTargetPostTrackId(), request.getTrackId());
        }

        // 이동할 트랙 자신 갱신
        updatePreTrackId(request.getProjectId(), request.getTrackId(), request.getTargetPreTrackId());
        updatePostTrackId(request.getProjectId(), request.getTrackId(), request.getTargetPostTrackId());

        Long sequenceNo = redisTemplate.opsForValue()
                .increment(String.format(EVENT_SEQ_KEY, request.getProjectId()));

        // 저장 실패 시에도 브로드 캐스트는 진행
        try {
            trackEventRepository.save(TrackReorderEventDocument.builder()
                    .event("TRACK_REORDER")
                    .projectId(request.getProjectId())
                    .trackId(request.getTrackId())
                    .userId(userId)
                    .sequenceNo(sequenceNo)
                    .timestamp(LocalDateTime.now())
                    .before(TrackReorderEventDocument.TrackPosition.builder()
                            .preTrackId(beforePreTrackId)
                            .postTrackId(beforePostTrackId)
                            .build())
                    .after(TrackReorderEventDocument.TrackPosition.builder()
                            .preTrackId(request.getTargetPreTrackId())
                            .postTrackId(request.getTargetPostTrackId())
                            .build())
                    .undoable(true)
                    .undone(false)
                    .build()
            );
        } catch (Exception e) {
            log.error("[MongoDB 이벤트 저장 실패]: event=TRACK_REORDER, trackId={}", request.getTrackId(), e);
        }

        return TrackReorderResponse.builder()
                .trackId(request.getTrackId())
                .preTrackId(request.getTargetPreTrackId())
                .postTrackId(request.getTargetPostTrackId())
                .build();
    }

    /*
        트랙명을 변경하는 메서드
    */
    public TrackRenameResponse renameTrack(TrackRenameRequest request, Integer userId) {
        request.validate();

        projectService.getProjectOrThrow(request.getProjectId());

        TrackState track = findTrack(request.getProjectId(), request.getTrackId());

        String beforeName = track.getName();

        TrackState updated = TrackState.builder()
                .trackId(track.getTrackId())
                .name(request.getName())
                .type(track.getType())
                .preTrackId(track.getPreTrackId())
                .postTrackId(track.getPostTrackId())
                .isMuted(track.getIsMuted())
                .isSoloed(track.getIsSoloed())
                .volume(track.getVolume())
                .pan(track.getPan())
                .build();

        saveTrackToRedis(request.getProjectId(), updated);

        Long sequenceNo = redisTemplate.opsForValue()
                .increment(String.format(EVENT_SEQ_KEY, request.getProjectId()));

        try {
            trackEventRepository.save(TrackRenameEventDocument.builder()
                    .event("TRACK_RENAME")
                    .projectId(request.getProjectId())
                    .trackId(request.getTrackId())
                    .userId(userId)
                    .sequenceNo(sequenceNo)
                    .timestamp(LocalDateTime.now())
                    .beforeTrackName(beforeName)
                    .afterTrackName(request.getName())
                    .undoable(true)
                    .undone(false)
                    .build());
        } catch (Exception e) {
            log.error("[MongoDB 이벤트 저장 실패]: event=TRACK_RENAME, trackId={}", request.getTrackId(), e);
        }

        return TrackRenameResponse.builder()
                .trackId(request.getTrackId())
                .name(request.getName())
                .build();
    }

    /*
        Redis에서 트랙을 조회한다.
     */
    private TrackState findTrack(Integer projectId, Integer trackId) {
        String key = String.format(TRACKS_KEY, projectId);
        String trackJson = (String) redisTemplate.opsForHash().get(key, String.valueOf(trackId));
        if (trackJson == null) {
            throw new BusinessException(ErrorCode.TRACK_NOT_FOUND);
        }
        try {
            return objectMapper.readValue(trackJson, TrackState.class);
        } catch (JsonProcessingException e) {
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR);
        }
    }

    /*
        Redis에서 마지막 트랙의 id를 조회한다.
     */
    private Integer findLastTrackId(Integer projectId) {
        String key = String.format(TRACKS_KEY, projectId);
        Map<Object, Object> entries = redisTemplate.opsForHash().entries(key);

        for (Map.Entry<Object, Object> entry : entries.entrySet()) {
            try {
                TrackState track = objectMapper.readValue((String) entry.getValue(), TrackState.class);
                if (track.getPostTrackId() == null) {
                    return track.getTrackId();
                }
            } catch (JsonProcessingException ignored) {
            }
        }
        return null;
    }

    /*
        Redis에 Track을 저장한다.
     */
    private void saveTrackToRedis(Integer projectId, TrackState track) {
        try {
            String key = String.format(TRACKS_KEY, projectId);
            String value = objectMapper.writeValueAsString(track);
            redisTemplate.opsForHash().put(key, String.valueOf(track.getTrackId()), value);
        } catch (JsonProcessingException e) {
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR);
        }
    }

    /*
        Redis에서 Track을 삭제한다.
     */
    private void removeTrackToRedis(Integer projectId, TrackState track) {
        String key = String.format(TRACKS_KEY, projectId);
        redisTemplate.opsForHash().delete(key, String.valueOf(track.getTrackId()));
    }

    /*
        PreTrackId를 갱신한다.
     */
    private void updatePreTrackId(Integer projectId, Integer trackId, Integer preTrackId) {
        String key = String.format(TRACKS_KEY, projectId);
        String trackJson = (String) redisTemplate.opsForHash().get(key, String.valueOf(trackId));
        if(trackJson == null)
            throw new BusinessException(ErrorCode.TRACK_NOT_FOUND);

        try {
            TrackState track = objectMapper.readValue(trackJson, TrackState.class);
            TrackState updated = TrackState.builder()
                    .trackId(track.getTrackId())
                    .name(track.getName())
                    .type(track.getType())
                    .preTrackId(preTrackId)
                    .postTrackId(track.getPostTrackId())
                    .isMuted(track.getIsMuted())
                    .isSoloed(track.getIsSoloed())
                    .volume(track.getVolume())
                    .pan(track.getPan())
                    .build();
            redisTemplate.opsForHash().put(key, String.valueOf(trackId), objectMapper.writeValueAsString(updated));
        } catch (JsonProcessingException e) {
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR);
        }
    }

    /*
        PostTrackId를 갱신한다.
     */
    private void updatePostTrackId(Integer projectId, Integer trackId, Integer postTrackId) {
        String key = String.format(TRACKS_KEY, projectId);
        String trackJson = (String) redisTemplate.opsForHash().get(key, String.valueOf(trackId));
        if (trackJson == null)
            throw new BusinessException(ErrorCode.TRACK_NOT_FOUND);

        try {
            TrackState track = objectMapper.readValue(trackJson, TrackState.class);
            TrackState updated = TrackState.builder()
                    .trackId(track.getTrackId())
                    .name(track.getName())
                    .type(track.getType())
                    .preTrackId(track.getPreTrackId())
                    .postTrackId(postTrackId)
                    .isMuted(track.getIsMuted())
                    .isSoloed(track.getIsSoloed())
                    .volume(track.getVolume())
                    .pan(track.getPan())
                    .build();
            redisTemplate.opsForHash().put(key, String.valueOf(trackId), objectMapper.writeValueAsString(updated));
        } catch (JsonProcessingException e) {
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR);
        }
    }

    /*
        ADD 또는 DELETE 이벤트 전용 MongoDB 저장하는 내부 메서드
     */
    private void saveTrackAddOrDeleteEvent(
            String eventType, Integer projectId, Integer newTrackId, Integer userId, Long sequenceNo,
            Integer preTrackId, Integer postTrackId){
        trackEventRepository.save(TrackEventDocument.builder()
                .event(eventType)
                .projectId(projectId)
                .trackId(newTrackId)
                .userId(userId)
                .sequenceNo(sequenceNo)
                .timestamp(LocalDateTime.now())
                .preTrackId(preTrackId)
                .postTrackId(postTrackId)
                .undoable(true)
                .undone(false)
                .build());
    }

    public List<Track> getTracksByProjectId(Integer projectId) {
        return trackRepository.findByProject_Id(projectId);
    }
}
