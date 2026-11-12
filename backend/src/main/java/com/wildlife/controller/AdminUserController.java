package com.wildlife.controller;

import com.wildlife.repository.UserAccountRepository;
import com.wildlife.entity.UserAccount;
import com.wildlife.entity.UserRole;
import com.wildlife.service.AuthenticationService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/admin/users")
public class AdminUserController {
    private final UserAccountRepository users;
    private final PasswordEncoder passwordEncoder;

    public AdminUserController(UserAccountRepository users, PasswordEncoder passwordEncoder) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
    }

    @GetMapping
    public List<AuthenticationService.UserView> listUsers() {
        return users.findAllByOrderByCreatedAtAsc().stream().map(AuthenticationService.UserView::from).toList();
    }

    @PostMapping
    public ResponseEntity<AuthenticationService.UserView> createUser(@Valid @RequestBody CreateUserRequest request) {
        String username = request.username().trim();
        String email = request.email().trim().toLowerCase(java.util.Locale.ROOT);
        if (users.findByUsernameIgnoreCaseOrEmailIgnoreCase(username, email).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Username or email is already registered.");
        }
        if (request.password().getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Password must be no more than 72 UTF-8 bytes.");
        }
        UserAccount account = new UserAccount();
        account.setUsername(username);
        account.setEmail(email);
        account.setPasswordHash(passwordEncoder.encode(request.password()));
        account.setRole(request.role());
        account.setEnabled(true);
        UserAccount saved = users.save(account);
        return ResponseEntity.status(HttpStatus.CREATED).body(AuthenticationService.UserView.from(saved));
    }

    public record CreateUserRequest(
            @NotBlank @Pattern(regexp = "[A-Za-z0-9._-]{3,64}") String username,
            @NotBlank @Email @Size(max = 254) String email,
            @NotBlank @Size(min = 16, max = 72) String password,
            @NotNull UserRole role) { }
}
