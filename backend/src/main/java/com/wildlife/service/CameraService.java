package com.wildlife.service;

import com.wildlife.entity.Camera;
import com.wildlife.repository.CameraRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;

@Service
public class CameraService {
    private final CameraRepository repo;

    public CameraService(CameraRepository repo) { this.repo = repo; }

    public List<Camera> findAll() { return repo.findAll(); }

    public Camera create(Camera c) { c.setId(null); return repo.save(c); }

    public Camera update(Long id, Camera c) {
        Camera existing = repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Camera not found"));
        existing.setCameraName(c.getCameraName());
        existing.setLocation(c.getLocation());
        existing.setStatus(c.getStatus());
        return repo.save(existing);
    }

    public void delete(Long id) {
        if (!repo.existsById(id)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Camera not found");
        repo.deleteById(id);
    }
}
