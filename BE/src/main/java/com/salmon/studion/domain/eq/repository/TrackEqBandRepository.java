package com.salmon.studion.domain.eq.repository;

import com.salmon.studion.domain.eq.entity.TrackEqBand;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface TrackEqBandRepository extends JpaRepository<TrackEqBand, Integer> {

    List<TrackEqBand> findByTrackEq_IdOrderByBandOrderAsc (Integer trackEqId);
    void deleteAllByTrackEq_Id (Integer trackEqId);

    void deleteAllByTrackEq_IdIn(Collection<Integer> orphanTrackEqIds);
}
