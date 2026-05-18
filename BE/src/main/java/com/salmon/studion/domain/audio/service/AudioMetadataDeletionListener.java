package com.salmon.studion.domain.audio.service;

import com.salmon.studion.domain.audio.event.AudioMetadataDeletedEvent;
import com.salmon.studion.global.infrastructure.s3.S3StorageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Slf4j
@Component
@RequiredArgsConstructor
public class AudioMetadataDeletionListener {

    private final S3StorageService s3StorageService;

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handle(AudioMetadataDeletedEvent event) {
        try {
            s3StorageService.deleteObject(event.objectKey());
        } catch (Exception exception) {
            log.error("[오디오 S3 삭제 실패] audioMetadataId={} objectKey={}",
                    event.audioMetadataId(), event.objectKey(), exception);
        }
    }
}
