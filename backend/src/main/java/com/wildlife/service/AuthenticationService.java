package com.wildlife.service;

import com.wildlife.entity.UserAccount;
import com.wildlife.repository.UserAccountRepository;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.stereotype.Service;

@Service
public class AuthenticationService {
    private final AuthenticationManager authenticationManager;
    private final UserAccountRepository users;
    private final JwtTokenService tokens;

    public AuthenticationService(AuthenticationManager authenticationManager, UserAccountRepository users, JwtTokenService tokens) {
        this.authenticationManager = authenticationManager;
        this.users = users;
        this.tokens = tokens;
    }

    public LoginResult login(String identifier, String password, boolean rememberMe) {
        if (password.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72) {
            throw new BadCredentialsException("Invalid username/email or password");
        }
        authenticationManager.authenticate(new UsernamePasswordAuthenticationToken(identifier.trim(), password));
        UserAccount user = users.findByUsernameIgnoreCaseOrEmailIgnoreCase(identifier.trim(), identifier.trim())
                .orElseThrow(() -> new IllegalStateException("Authenticated account could not be loaded"));
        return new LoginResult(UserView.from(user), tokens.issue(user, rememberMe));
    }

    public UserView currentUser(String username) {
        return users.findByUsernameIgnoreCase(username).map(UserView::from)
                .orElseThrow(() -> new IllegalStateException("Authenticated account could not be loaded"));
    }

    public void logout(String token) {
        tokens.revoke(token);
    }

    public record LoginResult(UserView user, JwtTokenService.IssuedToken token) { }
    public record UserView(Long id, String username, String email, String role) {
        public static UserView from(UserAccount user) {
            return new UserView(user.getId(), user.getUsername(), user.getEmail(), user.getRole().name());
        }
    }
}
