package com.wildlife.service;

import com.wildlife.entity.RevokedJwt;
import com.wildlife.entity.UserAccount;
import com.wildlife.repository.RevokedJwtRepository;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class JwtTokenService {
    private static final Duration SESSION_LIFETIME = Duration.ofHours(2);
    private static final Duration REMEMBER_LIFETIME = Duration.ofDays(7);

    private final JwtEncoder encoder;
    private final JwtDecoder decoder;
    private final RevokedJwtRepository revokedTokens;

    public JwtTokenService(JwtEncoder encoder, JwtDecoder decoder, RevokedJwtRepository revokedTokens) {
        this.encoder = encoder;
        this.decoder = decoder;
        this.revokedTokens = revokedTokens;
    }

    public IssuedToken issue(UserAccount user, boolean rememberMe) {
        Instant issuedAt = Instant.now();
        Instant expiresAt = issuedAt.plus(rememberMe ? REMEMBER_LIFETIME : SESSION_LIFETIME);
        String tokenId = UUID.randomUUID().toString();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer("zovive-api")
                .issuedAt(issuedAt)
                .expiresAt(expiresAt)
                .subject(user.getUsername())
                .id(tokenId)
                .claim("uid", user.getId())
                .claim("roles", List.of(user.getRole().name()))
                .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).type("JWT").build();
        String value = encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
        return new IssuedToken(value, expiresAt, rememberMe);
    }

    public void revoke(String tokenValue) {
        if (tokenValue == null || tokenValue.isBlank()) return;
        try {
            Jwt token = decoder.decode(tokenValue);
            if (token.getId() != null && token.getExpiresAt() != null) {
                revokedTokens.save(new RevokedJwt(token.getId(), token.getExpiresAt()));
            }
        } catch (JwtException ignored) {
            // An expired or invalid cookie is already unusable; the controller still clears it.
        }
    }

    public record IssuedToken(String value, Instant expiresAt, boolean rememberMe) { }
}
