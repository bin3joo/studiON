package com.salmon.studion.domain.project.service;

import com.salmon.studion.domain.project.dto.request.ProjectCreateRequest;
import com.salmon.studion.domain.project.entity.Project;
import com.salmon.studion.domain.project.repository.ProjectRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class ProjectService {

    private final ProjectRepository projectRepository;

    public Project createProject(ProjectCreateRequest projectCreateRequest) {
        Project project = Project.create(
                projectCreateRequest.getName(),
                projectCreateRequest.getRootNote(),
                projectCreateRequest.getProjectMode(),
                projectCreateRequest.getTempo(),
                projectCreateRequest.getTimeSigNumerator(),
                projectCreateRequest.getTimeSigDenominator()
        );

        return projectRepository.save(project);
    }
}
