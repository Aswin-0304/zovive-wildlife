package com.wildlife.controller;

import com.wildlife.entity.Camera;
import com.wildlife.service.CameraService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/cameras")
public class CameraController {
    private final CameraService service;

    public CameraController(CameraService service) { this.service = service; }

    @GetMapping
    public List<Camera> list() { return service.findAll(); }

    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    public Camera create(@Valid @RequestBody Camera c) { return service.create(c); }

    @PutMapping("/{id}")
    public Camera update(@PathVariable Long id, @Valid @RequestBody Camera c) { return service.update(id, c); }

    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) { service.delete(id); }
}
