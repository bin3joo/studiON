package com.salmon.studion.domain.track.repository;

import com.salmon.studion.domain.track.entity.TrackEventDocument;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface TrackEventRepository extends MongoRepository<TrackEventDocument, String> {
}
