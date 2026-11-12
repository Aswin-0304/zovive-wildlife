package com.wildlife.service;

import com.wildlife.entity.Alert;
import com.wildlife.repository.AlertRepository;
import com.wildlife.repository.CameraRepository;
import com.wildlife.repository.DetectionRepository;
import org.springframework.stereotype.Service;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class DashboardService {
    private final DetectionRepository detections;
    private final AlertRepository alerts;
    private final CameraRepository cameras;

    public DashboardService(DetectionRepository d, AlertRepository a, CameraRepository c) {
        this.detections = d; this.alerts = a; this.cameras = c;
    }

    public Map<String, Object> stats() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("totalDetections", detections.count());
        m.put("totalAlerts", alerts.count());
        m.put("resolvedAlerts", alerts.countByStatus(Alert.RESOLVED));
        m.put("activeCameras", cameras.countByStatus("ACTIVE"));
        List<Map<String, Object>> species = detections.countBySpecies().stream()
                .map(r -> Map.<String, Object>of("species", r[0], "count", r[1])).toList();
        m.put("speciesCounts", species);
        m.put("recentDetections", detections.findTop5ByOrderByDetectedAtDesc());
        m.put("recentAlerts", alerts.findTop5ByOrderByCreatedAtDesc());
        return m;
    }
}
