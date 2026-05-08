package com.salmon.studion.domain.ai.service;

import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.concurrent.atomic.AtomicInteger;

@Component
public class AiJobIdGenerator {

    private final AtomicInteger sequence = new AtomicInteger((int) (Instant.now().getEpochSecond() % 1_000_000_000));

    public Integer nextId() {
        return sequence.incrementAndGet();
    }
}
