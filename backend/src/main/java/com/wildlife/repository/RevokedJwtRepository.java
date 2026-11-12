package com.wildlife.repository;

import com.wildlife.entity.RevokedJwt;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;

public interface RevokedJwtRepository extends JpaRepository<RevokedJwt, String> {
    boolean existsByTokenIdAndExpiresAtAfter(String tokenId, Instant now);
    long deleteByExpiresAtBefore(Instant now);
}
