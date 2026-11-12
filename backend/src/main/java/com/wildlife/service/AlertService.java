package com.wildlife.service;

import com.wildlife.entity.Alert;
import com.wildlife.repository.AlertRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

@Service
public class AlertService {
    private static final Set<String> VALID = Set.of(Alert.NEW, Alert.UNDER_REVIEW, Alert.RESOLVED);
    private final AlertRepository repo;

    public AlertService(AlertRepository repo) { this.repo = repo; }

    public List<Alert> findAll() { return repo.findAllByOrderByCreatedAtDesc(); }

    public Alert create(Alert a) {
        a.setId(null);
        a.setStatus(Alert.NEW);
        a.setCreatedAt(LocalDateTime.now());
        return repo.save(a);
    }

    public Alert updateStatus(Long id, String status) {
        if (status == null || !VALID.contains(status))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Status must be NEW, UNDER_REVIEW or RESOLVED");
        Alert a = repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Alert not found"));
        a.setStatus(status);
        return repo.save(a);
    }
}
