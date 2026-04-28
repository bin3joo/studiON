package com.salmon.studion.domain.project.repository;

import com.salmon.studion.domain.project.entity.ProjectMember;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ProjectMemberRepository extends JpaRepository<ProjectMember, Integer> {
}
