package com.wildlife.repository;

import com.wildlife.entity.Camera;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CameraRepository extends JpaRepository<Camera, Long> {
    long countByStatus(String status);
}
