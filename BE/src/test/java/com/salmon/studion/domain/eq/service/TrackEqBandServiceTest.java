// package com.salmon.studion.domain.eq.service;

// import com.salmon.studion.domain.eq.dto.request.BandRequest;
// import com.salmon.studion.domain.eq.dto.response.TrackEqBandListResponse;
// import com.salmon.studion.domain.eq.entity.TrackEq;
// import com.salmon.studion.domain.eq.entity.TrackEqBand;
// import com.salmon.studion.domain.eq.repository.TrackEqBandRepository;
// import com.salmon.studion.domain.eq.repository.TrackEqRepository;
// import org.junit.jupiter.api.DisplayName;
// import org.junit.jupiter.api.Test;
// import org.junit.jupiter.api.extension.ExtendWith;
// import org.mockito.ArgumentCaptor;
// import org.mockito.InjectMocks;
// import org.mockito.Mock;
// import org.mockito.junit.jupiter.MockitoExtension;
// import org.springframework.test.util.ReflectionTestUtils;

// import java.lang.reflect.Constructor;
// import java.util.List;
// import java.util.Optional;

// import static org.assertj.core.api.Assertions.assertThat;
// import static org.mockito.Mockito.verify;
// import static org.mockito.Mockito.when;

// @ExtendWith(MockitoExtension.class)
// class TrackEqBandServiceTest {

//     @Mock
//     private TrackEqBandRepository trackEqBandRepository;

//     @Mock
//     private TrackEqRepository trackEqRepository;

//     @Mock
//     private com.salmon.studion.domain.project.service.ProjectMemberService projectMemberService;

//     @InjectMocks
//     private TrackEqBandService trackEqBandService;

//     @Test
//     @DisplayName("replaceTrackEqBands는 기존 밴드를 지우고 새 밴드들을 저장한다")
//     void replaceTrackEqBandsReplacesBands() {
//         TrackEq trackEq = TrackEq.create(5, 1);
//         ReflectionTestUtils.setField(trackEq, "id", 7);
//         when(trackEqRepository.findById(7)).thenReturn(Optional.of(trackEq));

//         List<BandRequest> requests = List.of(
//                 bandRequest(1, "BELL", 250, 1.2, -3.0, "USER_MANUAL"),
//                 bandRequest(2, "HIGH_SHELF", 4000, 0.7, 1.5, "SYSTEM")
//         );

//         trackEqBandService.replaceTrackEqBands(7, 99, requests);

//         verify(projectMemberService).validateProjectMember(1, 99);
//         verify(trackEqBandRepository).deleteAllByTrackEq_Id(7);

//         ArgumentCaptor<List<TrackEqBand>> captor = ArgumentCaptor.forClass(List.class);
//         verify(trackEqBandRepository).saveAll(captor.capture());

//         List<TrackEqBand> saved = captor.getValue();
//         assertThat(saved).hasSize(2);
//         assertThat(saved.get(0).getTrackEq()).isSameAs(trackEq);
//         assertThat(saved.get(0).getBandOrder()).isEqualTo(1);
//         assertThat(saved.get(0).getEqTypeCode()).isEqualTo(1);
//         assertThat(saved.get(0).getSourceTypeCode()).isEqualTo(2);
//         assertThat(saved.get(1).getEqTypeCode()).isEqualTo(3);
//         assertThat(saved.get(1).getSourceTypeCode()).isEqualTo(3);
//     }

//     @Test
//     @DisplayName("getTrackEqBandList는 entity를 응답 DTO로 변환한다")
//     void getTrackEqBandListMapsResponse() {
//         TrackEq trackEq = TrackEq.create(5, 1);
//         ReflectionTestUtils.setField(trackEq, "id", 7);

//         TrackEqBand first = TrackEqBand.create(trackEq, 1, 1, 250, 1.2, -3.0, null, null, null, 2);
//         TrackEqBand second = TrackEqBand.create(trackEq, 2, 3, 4000, 0.7, 1.5, null, null, null, 3);
//         ReflectionTestUtils.setField(first, "id", 101);
//         ReflectionTestUtils.setField(second, "id", 102);

//         when(trackEqRepository.findById(7)).thenReturn(Optional.of(trackEq));
//         when(trackEqBandRepository.findByTrackEq_IdOrderByBandOrderAsc(7)).thenReturn(List.of(first, second));

//         TrackEqBandListResponse response = trackEqBandService.getTrackEqBandList(7, 99);

//         verify(projectMemberService).validateProjectMember(1, 99);
//         assertThat(response.getTrackEqBandSummaries()).hasSize(2);
//         assertThat(response.getTrackEqBandSummaries().get(0).trackEqBandId()).isEqualTo(101);
//         assertThat(response.getTrackEqBandSummaries().get(0).eqType()).isEqualTo("BELL");
//         assertThat(response.getTrackEqBandSummaries().get(0).sourceType()).isEqualTo("USER_MANUAL");
//         assertThat(response.getTrackEqBandSummaries().get(1).eqType()).isEqualTo("HIGH_SHELF");
//         assertThat(response.getTrackEqBandSummaries().get(1).sourceType()).isEqualTo("SYSTEM");
//     }

//     @Test
//     @DisplayName("deleteTrackEqBands는 권한 확인 후 밴드만 삭제한다")
//     void deleteTrackEqBandsDeletesOnlyBands() {
//         TrackEq trackEq = TrackEq.create(5, 1);
//         ReflectionTestUtils.setField(trackEq, "id", 7);
//         when(trackEqRepository.findById(7)).thenReturn(Optional.of(trackEq));

//         trackEqBandService.deleteTrackEqBands(7, 99);

//         verify(projectMemberService).validateProjectMember(1, 99);
//         verify(trackEqBandRepository).deleteAllByTrackEq_Id(7);
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
//             throw new IllegalStateException("BandRequest 테스트 인스턴스 생성에 실패했습니다.", e);
//         }
//     }
// }
