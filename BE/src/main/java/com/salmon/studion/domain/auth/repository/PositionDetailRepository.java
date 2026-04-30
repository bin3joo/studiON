package com.salmon.studion.domain.auth.repository;

import com.salmon.studion.domain.auth.entity.PositionDetail;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PositionDetailRepository extends JpaRepository<PositionDetail, Integer> {

    // 특정 그룹의 포지션만 조회
    List<PositionDetail> findByPositionGroup_CodeOrderByOrderAsc(Integer groupCode);
}
