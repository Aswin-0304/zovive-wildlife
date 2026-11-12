package com.wildlife.controller;

import com.wildlife.config.SecurityConfig;
import com.wildlife.service.AuthenticationService;
import com.wildlife.service.JwtTokenService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.CacheControl;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.web.csrf.CsrfToken;

import java.time.Duration;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthenticationService authentication;
    private final boolean secureCookie;

    public AuthController(AuthenticationService authentication,
                          @Value("${app.security.cookie-secure:true}") boolean secureCookie) {
        this.authentication = authentication;
        this.secureCookie = secureCookie;
    }

    @GetMapping("/csrf")
    public ResponseEntity<CsrfResponse> csrf(CsrfToken token) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new CsrfResponse(token.getToken()));
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        AuthenticationService.LoginResult result = authentication.login(request.identifier(), request.password(), request.rememberMe());
        JwtTokenService.IssuedToken token = result.token();
        ResponseCookie.ResponseCookieBuilder cookie = ResponseCookie.from(SecurityConfig.AUTH_COOKIE, token.value())
                .httpOnly(true).secure(secureCookie).sameSite("Strict").path("/api");
        if (token.rememberMe()) cookie.maxAge(Duration.ofDays(7));
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie.build().toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(new LoginResponse(result.user()));
    }

    @GetMapping("/me")
    public ResponseEntity<AuthenticationService.UserView> me(Authentication principal) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(authentication.currentUser(principal.getName()));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request) {
        String token = null;
        Cookie[] cookies = request.getCookies();
        if (cookies != null) {
            for (Cookie cookie : cookies) {
                if (SecurityConfig.AUTH_COOKIE.equals(cookie.getName())) token = cookie.getValue();
            }
        }
        authentication.logout(token);
        ResponseCookie expired = ResponseCookie.from(SecurityConfig.AUTH_COOKIE, "")
                .httpOnly(true).secure(secureCookie).sameSite("Strict").path("/api").maxAge(Duration.ZERO).build();
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).header(HttpHeaders.SET_COOKIE, expired.toString()).build();
    }

    @ExceptionHandler({BadCredentialsException.class, DisabledException.class})
    public ResponseEntity<Map<String, String>> invalidCredentials() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(Map.of("message", "Invalid username/email or password."));
    }

    public record LoginRequest(@NotBlank @Size(max = 254) String identifier, @NotBlank @Size(max = 72) String password, boolean rememberMe) { }
    public record LoginResponse(AuthenticationService.UserView user) { }
    public record CsrfResponse(String token) { }
}
