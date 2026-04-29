package com.salmon.studion.domain.clip.repository;

import com.salmon.studion.domain.clip.entity.Clip;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ClipRepository extends JpaRepository<Clip, Integer> {
}
