package com.salmon.studion.domain.clip.repository;

import com.salmon.studion.domain.clip.entity.Clip;
import io.lettuce.core.dynamic.annotation.Param;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface ClipRepository extends JpaRepository<Clip, Integer> {
    @Query("""
        SELECT c
        FROM Clip c
        JOIN FETCH c.audioMetadata
        WHERE c.track.id in :trackIds
        """)
    List<Clip> findAllWithAudioMetadataByTrackIds(@Param("trackIds") List<Integer> trackIds);

    @Query("""
        SELECT c
        FROM Clip c
        JOIN FETCH c.audioMetadata am
        JOIN FETCH c.track t
        WHERE c.id IN :clipIds
        AND t.project.id = :projectId
    """)
    List<Clip> findAllByIdsAndProjectIdWithAudioMetadata(@Param("clipIds") List<Integer> clipIds, @Param("projectId") Integer projectId);
}
