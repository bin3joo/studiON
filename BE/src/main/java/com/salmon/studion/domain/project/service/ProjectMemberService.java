package com.salmon.studion.domain.project.service;

import com.salmon.studion.domain.auth.entity.User;
import com.salmon.studion.domain.project.entity.Project;
import com.salmon.studion.domain.project.entity.ProjectMember;
import com.salmon.studion.domain.project.repository.ProjectMemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ProjectMemberService {

    private final ProjectMemberRepository projectMemberRepository;

    public void createProjectMember(Project project, User user) {
        projectMemberRepository.save(ProjectMember.create(project, user));
    }

    public List<Integer> getProjectIdsByUserId(Integer userId) {
        return projectMemberRepository.findProjectIdsByUserId(userId);
    }

    public List<ProjectMember> getMembersWithUserByProjectIds(List<Integer> projectIds) {
        if (projectIds.isEmpty())
            return List.of();

        return projectMemberRepository.findAllWithUserByProjectIdIn(projectIds);
    }
}
