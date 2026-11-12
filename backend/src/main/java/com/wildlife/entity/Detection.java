package com.wildlife.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import java.time.LocalDateTime;

@Entity
@Table(name = "detections")
@Getter @Setter @NoArgsConstructor
public class Detection {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @NotBlank
    private String species;
    @NotNull @DecimalMin("0") @DecimalMax("100")
    private Double confidence;          // percentage, 0 - 100
    private String location;
    @NotNull
    private LocalDateTime detectedAt;
    private Long cameraId;              // optional reference to cameras.id
}
