package com.wildlife.service;

import com.wildlife.entity.Detection;
import com.wildlife.repository.DetectionRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDate;
import java.util.List;

@Service
public class DetectionService {
    private final DetectionRepository repo;

    public DetectionService(DetectionRepository repo) { this.repo = repo; }

    public List<Detection> search(String species, LocalDate from, LocalDate to) {
        String s = (species == null || species.isBlank()) ? null : species.trim();
        return repo.search(s,
                from == null ? null : from.atStartOfDay(),
                to == null ? null : to.plusDays(1).atStartOfDay());
    }

    public Detection create(Detection d) {
        d.setId(null);
        return repo.save(d);
    }

    public Detection update(Long id, Detection d) {
        Detection existing = repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Detection not found"));
        existing.setSpecies(d.getSpecies());
        existing.setConfidence(d.getConfidence());
        existing.setLocation(d.getLocation());
        existing.setDetectedAt(d.getDetectedAt());
        existing.setCameraId(d.getCameraId());
        return repo.save(existing);
    }

    public void delete(Long id) {
        if (!repo.existsById(id)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Detection not found");
        repo.deleteById(id);
    }
}
