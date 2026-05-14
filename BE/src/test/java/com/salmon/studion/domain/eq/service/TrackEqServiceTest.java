// package com.salmon.studion.domain.eq.service;

// import com.fasterxml.jackson.databind.ObjectMapper;
// import com.salmon.studion.domain.eq.dto.TrackEqDraftState;
// import com.salmon.studion.domain.eq.dto.request.BandRequest;
// import com.salmon.studion.domain.eq.dto.request.TrackEqCommitRequest;
// import com.salmon.studion.domain.eq.dto.request.TrackEqDraftSaveRequest;
// import com.salmon.studion.domain.eq.dto.request.TrackEqLockRequest;
// import com.salmon.studion.domain.eq.dto.request.TrackEqResetRequest;
// import com.salmon.studion.domain.eq.dto.response.TrackEqLockResponse;
// import com.salmon.studion.domain.eq.entity.TrackEq;
// import com.salmon.studion.domain.eq.entity.TrackEqBand;
// import com.salmon.studion.domain.eq.repository.TrackEqBandRepository;
// import com.salmon.studion.domain.eq.repository.TrackEqRepository;
// import com.salmon.studion.domain.project.entity.Project;
// import com.salmon.studion.domain.project.service.ProjectMemberService;
// import com.salmon.studion.domain.project.service.ProjectService;
// import com.salmon.studion.global.exception.BusinessException;
// import org.junit.jupiter.api.DisplayName;
// import org.junit.jupiter.api.Test;
// import org.junit.jupiter.api.extension.ExtendWith;
// import org.mockito.InOrder;
// import org.mockito.InjectMocks;
// import org.mockito.Mock;
// import org.mockito.Spy;
// import org.mockito.junit.jupiter.MockitoExtension;
// import org.springframework.data.redis.core.RedisTemplate;
// import org.springframework.data.redis.core.ValueOperations;
// import org.springframework.test.util.ReflectionTestUtils;

// import java.lang.reflect.Constructor;
// import java.util.List;
// import java.util.Optional;
// import java.util.concurrent.TimeUnit;

// import static org.assertj.core.api.Assertions.assertThat;
// import static org.assertj.core.api.Assertions.assertThatThrownBy;
// import static org.mockito.ArgumentMatchers.any;
// import static org.mockito.ArgumentMatchers.eq;
// import static org.mockito.Mockito.inOrder;
// import static org.mockito.Mockito.mock;
// import static org.mockito.Mockito.never;
// import static org.mockito.Mockito.verify;
// import static org.mockito.Mockito.verifyNoInteractions;
// import static org.mockito.Mockito.when;

// @ExtendWith(MockitoExtension.class)
// class TrackEqServiceTest {

//     @Mock
//     private TrackEqRepository trackEqRepository;

//     @Mock
//     private TrackEqBandRepository trackEqBandRepository;

//     @Mock
//     private ProjectService projectService;

//     @Mock
//     private ProjectMemberService projectMemberService;

//     @Mock
//     private RedisTemplate<String, String> redisTemplate;

//     @Mock
//     private ValueOperations<String, String> valueOperations;

//     @Mock
//     private TrackEqBandService trackEqBandService;

//     @Spy
//     private ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

//     @InjectMocks
//     private TrackEqService trackEqService;

//     @Test
//     @DisplayName("createIfAbsent는 track eq가 없으면 생성한다")
//     void createIfAbsentCreatesTrackEqWhenMissing() {
//         when(trackEqRepository.existsByTrackId(11)).thenReturn(false);
//         when(redisTemplate.opsForValue()).thenReturn(valueOperations);
//         when(trackEqRepository.save(any(TrackEq.class))).thenAnswer(invocation -> invocation.getArgument(0));

//         trackEqService.createIfAbsent(11, 22);

//         verify(trackEqRepository).save(org.mockito.ArgumentMatchers.argThat(trackEq ->
//                 trackEq.getTrackId().equals(11) && trackEq.getProjectId().equals(22)
//         ));
//         verify(valueOperations).set(eq("project:22:track:11:eq:current"), any(String.class));
//     }

//     @Test
//     @DisplayName("createIfAbsent는 이미 존재하면 저장하지 않는다")
//     void createIfAbsentDoesNothingWhenExists() {
//         when(trackEqRepository.existsByTrackId(11)).thenReturn(true);

//         trackEqService.createIfAbsent(11, 22);

//         verify(trackEqRepository, never()).save(any());
//     }

//     @Test
//     @DisplayName("lockTrackEq는 TTL과 함께 락을 획득한다")
//     void lockTrackEqAcquiresLock() {
//         TrackEq trackEq = trackEq(7, 30, 1);
//         TrackEqLockRequest request = lockRequest(1, 7, true);

//         baseAuthorizedTrackEq(trackEq);
//         when(redisTemplate.opsForValue()).thenReturn(valueOperations);
//         when(valueOperations.setIfAbsent("project:1:track-eq:7:lock", "99", 30L, TimeUnit.SECONDS)).thenReturn(true);

//         TrackEqLockResponse response = trackEqService.lockTrackEq(request, 99);

//         assertThat(response.getTrackEqId()).isEqualTo(7);
//         assertThat(response.getIsLocked()).isTrue();
//         assertThat(response.getUserId()).isEqualTo(99);
//     }

//     @Test
//     @DisplayName("lockTrackEq는 같은 사용자의 재요청이면 TTL만 갱신한다")
//     void lockTrackEqRefreshesTtlForSameUser() {
//         TrackEq trackEq = trackEq(7, 30, 1);
//         TrackEqLockRequest request = lockRequest(1, 7, true);

//         baseAuthorizedTrackEq(trackEq);
//         when(redisTemplate.opsForValue()).thenReturn(valueOperations);
//         when(valueOperations.setIfAbsent("project:1:track-eq:7:lock", "99", 30L, TimeUnit.SECONDS)).thenReturn(false);
//         when(valueOperations.get("project:1:track-eq:7:lock")).thenReturn("99");

//         TrackEqLockResponse response = trackEqService.lockTrackEq(request, 99);

//         assertThat(response.getIsLocked()).isTrue();
//         verify(redisTemplate).expire("project:1:track-eq:7:lock", 30L, TimeUnit.SECONDS);
//     }

//     @Test
//     @DisplayName("lockTrackEq는 다른 사용자가 점유 중이면 예외를 던진다")
//     void lockTrackEqThrowsWhenAlreadyLocked() {
//         TrackEq trackEq = trackEq(7, 30, 1);
//         TrackEqLockRequest request = lockRequest(1, 7, true);

//         baseAuthorizedTrackEq(trackEq);
//         when(redisTemplate.opsForValue()).thenReturn(valueOperations);
//         when(valueOperations.setIfAbsent("project:1:track-eq:7:lock", "99", 30L, TimeUnit.SECONDS)).thenReturn(false);
//         when(valueOperations.get("project:1:track-eq:7:lock")).thenReturn("55");

//         assertThatThrownBy(() -> trackEqService.lockTrackEq(request, 99))
//                 .isInstanceOf(BusinessException.class);
//     }

//     @Test
//     @DisplayName("lockTrackEq는 본인 락만 해제한다")
//     void lockTrackEqReleasesOwnedLock() {
//         TrackEq trackEq = trackEq(7, 30, 1);
//         TrackEqLockRequest request = lockRequest(1, 7, false);

//         baseAuthorizedTrackEq(trackEq);
//         when(redisTemplate.opsForValue()).thenReturn(valueOperations);
//         when(valueOperations.get("project:1:track-eq:7:lock")).thenReturn("99");

//         TrackEqLockResponse response = trackEqService.lockTrackEq(request, 99);

//         assertThat(response.getIsLocked()).isFalse();
//         verify(redisTemplate).delete("project:1:track-eq:7:lock");
//     }

//     @Test
//     @DisplayName("saveDraft는 락 소유자가 draft를 저장하고 TTL을 갱신한다")
//     void saveDraftStoresDraftAndRefreshesLockTtl() throws Exception {
//         TrackEq trackEq = trackEq(7, 30, 1);
//         TrackEqDraftSaveRequest request = draftSaveRequest(1, 7, List.of(
//                 bandRequest(1, "BELL", 250, 1.2, -3.0, "USER_MANUAL"),
//                 bandRequest(2, "HIGH_SHELF", 4000, 0.7, 1.5, "SYSTEM")
//         ));

//         baseAuthorizedTrackEq(trackEq);
//         when(redisTemplate.opsForValue()).thenReturn(valueOperations);
//         when(valueOperations.get("project:1:track-eq:7:lock")).thenReturn("99");

//         TrackEqDraftState draftState = trackEqService.saveDraft(request, 99);

//         assertThat(draftState.getTrackEqId()).isEqualTo(7);
//         assertThat(draftState.getBands()).hasSize(2);
//         assertThat(draftState.getVersion()).isEqualTo(1L);
//         verify(redisTemplate).expire("project:1:track-eq:7:lock", 30L, TimeUnit.SECONDS);
//         verify(valueOperations).set(eq("project:1:track-eq:7:draft"), any(String.class), eq(86400L), eq(TimeUnit.SECONDS));
//         verify(valueOperations).set(eq("project:1:track:30:eq:current"), any(String.class));
//     }

//     @Test
//     @DisplayName("saveDraft는 중복 bandOrder를 거부한다")
//     void saveDraftRejectsDuplicateBandOrder() {
//         TrackEq trackEq = trackEq(7, 30, 1);
//         TrackEqDraftSaveRequest request = draftSaveRequest(1, 7, List.of(
//                 bandRequest(1, "BELL", 250, 1.2, -3.0, "USER_MANUAL"),
//                 bandRequest(1, "HIGH_SHELF", 4000, 0.7, 1.5, "SYSTEM")
//         ));

//         baseAuthorizedTrackEq(trackEq);

//         assertThatThrownBy(() -> trackEqService.saveDraft(request, 99))
//                 .isInstanceOf(BusinessException.class);
//     }

//     @Test
//     @DisplayName("resetDraft는 빈 draft를 저장한다")
//     void resetDraftStoresEmptyDraft() {
//         TrackEq trackEq = trackEq(7, 30, 1);
//         TrackEqResetRequest request = resetRequest(1, 7);

//         baseAuthorizedTrackEq(trackEq);
//         when(redisTemplate.opsForValue()).thenReturn(valueOperations);
//         when(valueOperations.get("project:1:track-eq:7:lock")).thenReturn("99");

//         TrackEqDraftState draftState = trackEqService.resetDraft(request, 99);

//         assertThat(draftState.getBands()).isEmpty();
//         assertThat(draftState.getVersion()).isEqualTo(1L);
//         verify(valueOperations).set(eq("project:1:track-eq:7:draft"), any(String.class), eq(86400L), eq(TimeUnit.SECONDS));
//         verify(valueOperations).set(eq("project:1:track:30:eq:current"), any(String.class));
//     }

//     @Test
//     @DisplayName("commitDraft는 draft를 MySQL에 반영하고 draft와 lock을 삭제한다")
//     void commitDraftReplacesBandsAndDeletesDraftAndLock() throws Exception {
//         TrackEq trackEq = trackEq(7, 30, 1);
//         TrackEqCommitRequest request = commitRequest(1, 7);
//         TrackEqDraftState draftState = TrackEqDraftState.builder()
//                 .projectId(1)
//                 .trackEqId(7)
//                 .updatedBy(99)
//                 .version(2L)
//                 .bands(List.of(
//                         TrackEqDraftState.DraftBand.builder()
//                                 .bandOrder(1)
//                                 .eqType("BELL")
//                                 .frequencyHz(250)
//                                 .q(1.2)
//                                 .gainDeltaDb(-3.0)
//                                 .sourceType("USER_MANUAL")
//                                 .build()
//                 ))
//                 .build();

//         baseAuthorizedTrackEq(trackEq);
//         when(redisTemplate.opsForValue()).thenReturn(valueOperations);
//         when(valueOperations.get("project:1:track-eq:7:lock")).thenReturn("99");
//         String serializedDraft = objectMapper.writeValueAsString(draftState);
//         when(valueOperations.get("project:1:track-eq:7:draft")).thenReturn(serializedDraft);

//         TrackEqDraftState response = trackEqService.commitDraft(request, 99);

//         assertThat(response.getVersion()).isEqualTo(2L);
//         org.mockito.ArgumentCaptor<List<TrackEqDraftState.DraftBand>> captor = org.mockito.ArgumentCaptor.forClass(List.class);
//         verify(trackEqBandService).replaceTrackEqBandsFromDraft(eq(7), eq(99), captor.capture());
//         assertThat(captor.getValue()).hasSize(1);
//         assertThat(captor.getValue().get(0).getBandOrder()).isEqualTo(1);
//         assertThat(captor.getValue().get(0).getEqType()).isEqualTo("BELL");
//         verify(valueOperations).set(eq("project:1:track:30:eq:current"), any(String.class));
//         verify(redisTemplate).delete("project:1:track-eq:7:draft");
//         verify(redisTemplate).delete("project:1:track-eq:7:lock");
//     }

//     @Test
//     @DisplayName("commitDraft는 draft가 없으면 예외를 던진다")
//     void commitDraftThrowsWhenDraftMissing() {
//         TrackEq trackEq = trackEq(7, 30, 1);
//         TrackEqCommitRequest request = commitRequest(1, 7);

//         baseAuthorizedTrackEq(trackEq);
//         when(redisTemplate.opsForValue()).thenReturn(valueOperations);
//         when(valueOperations.get("project:1:track-eq:7:lock")).thenReturn("99");
//         when(valueOperations.get("project:1:track-eq:7:draft")).thenReturn(null);

//         assertThatThrownBy(() -> trackEqService.commitDraft(request, 99))
//                 .isInstanceOf(BusinessException.class);
//     }

//     @Test
//     @DisplayName("deleteByTrackId는 band, redis, track eq를 순서대로 정리한다")
//     void deleteByTrackIdDeletesBandsAndTrackEq() {
//         TrackEq trackEq = trackEq(7, 11, 22);
//         when(trackEqRepository.findByTrackId(11)).thenReturn(Optional.of(trackEq));

//         trackEqService.deleteByTrackIdIfExists(11);

//         InOrder inOrder = inOrder(trackEqBandRepository, redisTemplate, trackEqRepository);
//         inOrder.verify(trackEqBandRepository).deleteAllByTrackEq_Id(7);
//         inOrder.verify(redisTemplate).delete("project:22:track-eq:7:lock");
//         inOrder.verify(redisTemplate).delete("project:22:track-eq:7:draft");
//         inOrder.verify(redisTemplate).delete("project:22:track:11:eq:current");
//         inOrder.verify(trackEqRepository).delete(trackEq);
//     }

//     @Test
//     @DisplayName("deleteByTrackId는 track eq가 없으면 아무 것도 하지 않는다")
//     void deleteByTrackIdNoopWhenTrackEqMissing() {
//         when(trackEqRepository.findByTrackId(11)).thenReturn(Optional.empty());

//         trackEqService.deleteByTrackIdIfExists(11);

//         verifyNoInteractions(trackEqBandRepository);
//     }

//     @Test
//     @DisplayName("getCurrentTrackEqPayloads는 Redis projection 누락 시 MySQL committed band로 복구한다")
//     void getCurrentTrackEqPayloadsHydratesMissingProjectionFromMysql() {
//         TrackEq trackEq = trackEq(7, 30, 1);
//         when(redisTemplate.opsForValue()).thenReturn(valueOperations);
//         when(valueOperations.get("project:1:track:30:eq:current")).thenReturn(null);
//         when(trackEqRepository.findByTrackId(30)).thenReturn(Optional.of(trackEq));
//         when(trackEqBandRepository.findByTrackEq_IdOrderByBandOrderAsc(7)).thenReturn(List.of(
//                 trackEqBand(trackEq, 1, 1, 4200, 1.2, -2.5, 2)
//         ));

//         var payloads = trackEqService.getCurrentTrackEqPayloads(1, List.of(30));

//         assertThat(payloads).hasSize(1);
//         assertThat(payloads.get(0).getTrackId()).isEqualTo(30);
//         assertThat(payloads.get(0).getBands()).hasSize(1);
//         assertThat(payloads.get(0).getBands().get(0).getEqType()).isEqualTo("BELL");
//         verify(valueOperations).set(eq("project:1:track:30:eq:current"), any(String.class));
//     }

//     @Test
//     @DisplayName("synchronizeWithTrackIds는 신규 projection을 만들고 고아 projection을 삭제한다")
//     void synchronizeWithTrackIdsKeepsCurrentProjectionInSync() {
//         TrackEq orphan = trackEq(7, 11, 22);
//         TrackEq persistedNew = trackEq(9, 13, 22);
//         when(redisTemplate.opsForValue()).thenReturn(valueOperations);
//         when(trackEqRepository.findByProjectId(22)).thenReturn(List.of(orphan));
//         when(trackEqRepository.saveAll(any())).thenReturn(List.of(persistedNew));

//         trackEqService.synchronizeWithTrackIds(22, List.of(13));

//         verify(valueOperations).set(eq("project:22:track:13:eq:current"), any(String.class));
//         verify(redisTemplate).delete("project:22:track:11:eq:current");
//         verify(trackEqBandRepository).deleteAllByTrackEq_IdIn(List.of(7));
//         verify(trackEqRepository).deleteAllByIdInBatch(List.of(7));
//     }

//     private void baseAuthorizedTrackEq(TrackEq trackEq) {
//         when(projectService.getProjectOrThrow(trackEq.getProjectId())).thenReturn(mock(Project.class));
//         when(trackEqRepository.findById(trackEq.getId())).thenReturn(Optional.of(trackEq));
//     }

//     private TrackEq trackEq(Integer id, Integer trackId, Integer projectId) {
//         TrackEq trackEq = TrackEq.create(trackId, projectId);
//         ReflectionTestUtils.setField(trackEq, "id", id);
//         return trackEq;
//     }

//     private TrackEqBand trackEqBand(
//             TrackEq trackEq,
//             Integer id,
//             Integer eqTypeCode,
//             Integer frequencyHz,
//             Double q,
//             Double gainDeltaDb,
//             Integer bandOrder
//     ) {
//         TrackEqBand band = TrackEqBand.create(
//                 trackEq,
//                 bandOrder,
//                 eqTypeCode,
//                 frequencyHz,
//                 q,
//                 gainDeltaDb,
//                 null,
//                 null,
//                 null,
//                 2
//         );
//         ReflectionTestUtils.setField(band, "id", id);
//         return band;
//     }

//     private TrackEqLockRequest lockRequest(Integer projectId, Integer trackEqId, boolean isLocked) {
//         TrackEqLockRequest request = new TrackEqLockRequest();
//         request.setProjectId(projectId);
//         request.setTrackEqId(trackEqId);
//         request.setIsLocked(isLocked);
//         return request;
//     }

//     private TrackEqDraftSaveRequest draftSaveRequest(Integer projectId, Integer trackEqId, List<BandRequest> bands) {
//         TrackEqDraftSaveRequest request = new TrackEqDraftSaveRequest();
//         request.setProjectId(projectId);
//         request.setTrackEqId(trackEqId);
//         request.setBands(bands);
//         return request;
//     }

//     private TrackEqResetRequest resetRequest(Integer projectId, Integer trackEqId) {
//         TrackEqResetRequest request = new TrackEqResetRequest();
//         request.setProjectId(projectId);
//         request.setTrackEqId(trackEqId);
//         return request;
//     }

//     private TrackEqCommitRequest commitRequest(Integer projectId, Integer trackEqId) {
//         TrackEqCommitRequest request = new TrackEqCommitRequest();
//         request.setProjectId(projectId);
//         request.setTrackEqId(trackEqId);
//         return request;
//     }

//     private BandRequest bandRequest(
//             Integer bandOrder,
//             String eqType,
//             Integer frequencyHz,
//             Double q,
//             Double gainDeltaDb,
//             String sourceType
//     ) {
//         BandRequest request = instantiateBandRequest();
//         ReflectionTestUtils.setField(request, "bandOrder", bandOrder);
//         ReflectionTestUtils.setField(request, "eqType", eqType);
//         ReflectionTestUtils.setField(request, "frequencyHz", frequencyHz);
//         ReflectionTestUtils.setField(request, "q", q);
//         ReflectionTestUtils.setField(request, "gainDeltaDb", gainDeltaDb);
//         ReflectionTestUtils.setField(request, "sourceType", sourceType);
//         return request;
//     }

//     private BandRequest instantiateBandRequest() {
//         try {
//             Constructor<BandRequest> constructor = BandRequest.class.getDeclaredConstructor();
//             constructor.setAccessible(true);
//             return constructor.newInstance();
//         } catch (Exception e) {
//             throw new IllegalStateException("BandRequest 인스턴스를 만들 수 없습니다.", e);
//         }
//     }
// }
