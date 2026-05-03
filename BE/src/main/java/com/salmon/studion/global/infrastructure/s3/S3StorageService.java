package com.salmon.studion.global.infrastructure.s3;

import com.salmon.studion.global.infrastructure.s3.dto.PresignedUrlResult;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

import java.time.Duration;


@Service
@RequiredArgsConstructor
public class S3StorageService {

    private final S3Presigner s3Presigner;
    private final S3Client s3Client;
    private final S3ObjectKeyGenerator s3ObjectKeyGenerator;

    @Value("${cloud.aws.s3.bucket}")
    private String bucket;

    @Value("${cloud.aws.s3.upload-url-expiration-minutes}")
    private Long uploadUrlExpirationMinutes;

    public PresignedUrlResult createUploadUrl(Integer projectId, String originalName, String contentType, Integer sizeBytes) {
        String storedName = s3ObjectKeyGenerator.createStoredName(originalName);
        String objectKey = s3ObjectKeyGenerator.createAudioObjectKey(projectId, storedName);

        PutObjectRequest putObjectRequest = PutObjectRequest.builder()
                .bucket(bucket)
                .key(objectKey)
                .contentType(contentType)
                .contentLength(sizeBytes.longValue())
                .build();

        PutObjectPresignRequest presignRequest = PutObjectPresignRequest.builder()
                .signatureDuration(Duration.ofMinutes(uploadUrlExpirationMinutes))
                .putObjectRequest(putObjectRequest)
                .build();

        String uploadUrl = s3Presigner.presignPutObject(presignRequest)
                .url()
                .toString();

        return PresignedUrlResult.of(objectKey, storedName, uploadUrl);
    }
}
