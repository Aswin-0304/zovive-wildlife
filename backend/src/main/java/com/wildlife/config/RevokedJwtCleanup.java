package com.wildlife.config;

import com.wildlife.repository.RevokedJwtRepository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;

@Component
public class RevokedJwtCleanup {
    private final RevokedJwtRepository revokedTokens;

    public RevokedJwtCleanup(RevokedJwtRepository revokedTokens) {
        this.revokedTokens = revokedTokens;
    }

    @Scheduled(fixedDelayString = "${app.security.revoked-token-cleanup-ms:3600000}")
    public void removeExpiredRevocations() {
        revokedTokens.deleteByExpiresAtBefore(Instant.now());
    }
}
