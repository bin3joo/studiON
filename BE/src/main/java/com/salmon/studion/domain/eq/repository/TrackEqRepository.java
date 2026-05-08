package com.salmon.studion.domain.eq.repository;

import com.salmon.studion.domain.eq.entity.TrackEq;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TrackEqRepository extends JpaRepository<TrackEq, Integer> {

    List<TrackEq> findByProjectId(Integer projectId);
    boolean existsByTrackId(Integer trackId);
}
