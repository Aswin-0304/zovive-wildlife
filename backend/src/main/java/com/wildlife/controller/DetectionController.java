package com.wildlife.controller;

import com.wildlife.entity.Detection;
import com.wildlife.service.DetectionService;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/detections")
public class DetectionController {
    private final DetectionService service;

    public DetectionController(DetectionService service) { this.service = service; }

    @GetMapping
    public List<Detection> list(@RequestParam(required = false) String species,
                                @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.search(species, from, to);
    }

    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    public Detection create(@Valid @RequestBody Detection d) { return service.create(d); }

    @PutMapping("/{id}")
    public Detection update(@PathVariable Long id, @Valid @RequestBody Detection d) { return service.update(id, d); }

    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) { service.delete(id); }
}
