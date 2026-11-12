package com.wildlife.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "revoked_jwts")
@Getter
@Setter
@NoArgsConstructor
public class RevokedJwt {
    @Id
    @Column(name = "token_id", length = 36, nullable = false)
    private String tokenId;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    public RevokedJwt(String tokenId, Instant expiresAt) {
        this.tokenId = tokenId;
        this.expiresAt = expiresAt;
    }
}
