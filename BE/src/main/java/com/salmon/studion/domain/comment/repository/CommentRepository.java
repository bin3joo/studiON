package com.salmon.studion.domain.comment.repository;

import com.salmon.studion.domain.comment.entity.Comment;
import io.lettuce.core.dynamic.annotation.Param;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface CommentRepository extends JpaRepository<Comment, Integer> {

    @Query("""
        SELECT c
        FROM Comment c
        JOIN FETCH c.user u
        JOIN FETCH c.track t
        WHERE c.id = :commentId
          AND t.project.id = :projectId
    """)
    Optional<Comment> findByIdAndProjectId(@Param("commentId") Integer commentId, @Param("projectId") Integer projectId);

}
