package com.wildlife.repository;

import com.wildlife.entity.UserAccount;
import com.wildlife.entity.UserRole;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserAccountRepository extends JpaRepository<UserAccount, Long> {
    Optional<UserAccount> findByUsernameIgnoreCase(String username);
    Optional<UserAccount> findByUsernameIgnoreCaseOrEmailIgnoreCase(String username, String email);
    boolean existsByRole(UserRole role);
    List<UserAccount> findAllByOrderByCreatedAtAsc();
}
