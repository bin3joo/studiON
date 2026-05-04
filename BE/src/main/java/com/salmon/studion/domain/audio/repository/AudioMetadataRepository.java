package com.salmon.studion.domain.audio.repository;

import com.salmon.studion.domain.audio.entity.AudioMetadata;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface AudioMetadataRepository extends JpaRepository<AudioMetadata, Integer> {
}
