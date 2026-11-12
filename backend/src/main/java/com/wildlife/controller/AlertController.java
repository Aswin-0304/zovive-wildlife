package com.wildlife.controller;

import com.wildlife.entity.Alert;
import com.wildlife.service.AlertService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/alerts")
public class AlertController {
    private final AlertService service;

    public AlertController(AlertService service) { this.service = service; }

    @GetMapping
    public List<Alert> list() { return service.findAll(); }

    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    public Alert create(@Valid @RequestBody Alert a) { return service.create(a); }

    // Body: { "status": "RESOLVED" }
    @PutMapping("/{id}")
    public Alert updateStatus(@PathVariable Long id, @RequestBody Map<String, String> body) {
        return service.updateStatus(id, body.get("status"));
    }
}
