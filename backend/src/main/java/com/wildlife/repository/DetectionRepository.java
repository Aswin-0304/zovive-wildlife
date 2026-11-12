package com.wildlife.repository;

import com.wildlife.entity.Detection;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.LocalDateTime;
import java.util.List;

public interface DetectionRepository extends JpaRepository<Detection, Long> {

    @Query("SELECT d FROM Detection d WHERE " +
           "(:species IS NULL OR LOWER(d.species) LIKE LOWER(CONCAT('%', :species, '%'))) " +
           "AND (:from IS NULL OR d.detectedAt >= :from) " +
           "AND (:to IS NULL OR d.detectedAt < :to) " +
           "ORDER BY d.detectedAt DESC")
    List<Detection> search(@Param("species") String species,
                           @Param("from") LocalDateTime from,
                           @Param("to") LocalDateTime to);

    List<Detection> findTop5ByOrderByDetectedAtDesc();

    @Query("SELECT d.species, COUNT(d) FROM Detection d GROUP BY d.species ORDER BY COUNT(d) DESC")
    List<Object[]> countBySpecies();
}
