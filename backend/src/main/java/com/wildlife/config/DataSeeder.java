package com.wildlife.config;

import com.wildlife.entity.Alert;
import com.wildlife.entity.Camera;
import com.wildlife.entity.Detection;
import com.wildlife.repository.AlertRepository;
import com.wildlife.repository.CameraRepository;
import com.wildlife.repository.DetectionRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;
import java.time.LocalDateTime;

/** Loads SAMPLE data on first run only (when the detections table is empty). */
@Component
public class DataSeeder implements CommandLineRunner {
    private final CameraRepository cameras;
    private final DetectionRepository detections;
    private final AlertRepository alerts;

    public DataSeeder(CameraRepository c, DetectionRepository d, AlertRepository a) {
        this.cameras = c; this.detections = d; this.alerts = a;
    }

    @Override
    public void run(String... args) {
        if (detections.count() > 0) return;

        String[][] cams = {{"Camera North Gate", "North Gate", "ACTIVE"},
                           {"Camera River Bend", "River Bend", "ACTIVE"},
                           {"Camera Forest Trail", "Forest Trail", "INACTIVE"}};
        Camera[] saved = new Camera[cams.length];
        for (int i = 0; i < cams.length; i++) {
            Camera c = new Camera();
            c.setCameraName(cams[i][0]); c.setLocation(cams[i][1]); c.setStatus(cams[i][2]);
            saved[i] = cameras.save(c);
        }

        String[] species = {"Elephant", "Tiger", "Deer", "Leopard", "Wild Boar", "Peacock", "Deer", "Elephant", "Deer", "Tiger", "Wild Boar", "Leopard"};
        double[] conf = {94.5, 88.2, 91.0, 79.4, 85.7, 96.1, 90.3, 92.8, 87.5, 83.9, 89.1, 76.6};
        LocalDateTime now = LocalDateTime.now();
        for (int i = 0; i < species.length; i++) {
            Camera cam = saved[i % 3];
            Detection d = new Detection();
            d.setSpecies(species[i]); d.setConfidence(conf[i]);
            d.setLocation(cam.getLocation());
            d.setDetectedAt(now.minusDays(i / 2).minusHours(i * 3L));
            d.setCameraId(cam.getId());
            d = detections.save(d);

            if (species[i].equals("Elephant") || species[i].equals("Tiger") || species[i].equals("Leopard")) {
                Alert a = new Alert();
                a.setDetectionId(d.getId());
                a.setAlertType(species[i] + " movement near boundary");
                a.setStatus(i % 3 == 0 ? Alert.NEW : (i % 3 == 1 ? Alert.UNDER_REVIEW : Alert.RESOLVED));
                a.setCreatedAt(d.getDetectedAt().plusMinutes(5));
                alerts.save(a);
            }
        }
    }
}
