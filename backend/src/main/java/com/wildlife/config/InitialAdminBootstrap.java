package com.wildlife.config;

import com.wildlife.entity.UserAccount;
import com.wildlife.entity.UserRole;
import com.wildlife.repository.UserAccountRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.env.Environment;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

@Component
public class InitialAdminBootstrap implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(InitialAdminBootstrap.class);
    private final Environment environment;
    private final UserAccountRepository users;
    private final PasswordEncoder passwordEncoder;

    public InitialAdminBootstrap(Environment environment, UserAccountRepository users, PasswordEncoder passwordEncoder) {
        this.environment = environment;
        this.users = users;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(String... args) {
        if (users.existsByRole(UserRole.ADMIN)) return;
        String username = environment.getProperty("INITIAL_ADMIN_USERNAME");
        String email = environment.getProperty("INITIAL_ADMIN_EMAIL");
        String password = environment.getProperty("INITIAL_ADMIN_PASSWORD");
        boolean anyConfigured = StringUtils.hasText(username) || StringUtils.hasText(email) || StringUtils.hasText(password);
        if (!anyConfigured) {
            log.warn("No administrator account exists yet. Restart with start-local.ps1 and enter the first admin username, email and password.");
            return;
        }
        if (!StringUtils.hasText(username) || !StringUtils.hasText(email) || !StringUtils.hasText(password)) {
            throw new IllegalStateException("Set INITIAL_ADMIN_USERNAME, INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD together to bootstrap the first admin.");
        }
        username = username.trim();
        email = email.trim().toLowerCase(Locale.ROOT);
        if (!username.matches("[A-Za-z0-9._-]{3,64}")) {
            throw new IllegalStateException("INITIAL_ADMIN_USERNAME must be 3–64 letters, numbers, dots, underscores or hyphens.");
        }
        if (!email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) {
            throw new IllegalStateException("INITIAL_ADMIN_EMAIL must be a valid email address.");
        }
        int passwordBytes = password.getBytes(StandardCharsets.UTF_8).length;
        if (passwordBytes < 16 || passwordBytes > 72) {
            throw new IllegalStateException("INITIAL_ADMIN_PASSWORD must contain 16–72 characters (BCrypt's safe maximum is 72 bytes).");
        }
        if (users.findByUsernameIgnoreCaseOrEmailIgnoreCase(username, email).isPresent()) {
            throw new IllegalStateException("The initial admin username or email already belongs to a non-admin account.");
        }

        UserAccount admin = new UserAccount();
        admin.setUsername(username);
        admin.setEmail(email);
        admin.setPasswordHash(passwordEncoder.encode(password));
        admin.setRole(UserRole.ADMIN);
        admin.setEnabled(true);
        users.save(admin);
    }
}
