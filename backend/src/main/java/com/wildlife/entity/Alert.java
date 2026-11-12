package com.wildlife.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import java.time.LocalDateTime;

@Entity
@Table(name = "alerts")
@Getter @Setter @NoArgsConstructor
public class Alert {
    public static final String NEW = "NEW", UNDER_REVIEW = "UNDER_REVIEW", RESOLVED = "RESOLVED";

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private Long detectionId;
    @NotBlank
    private String alertType;
    private String status = NEW;
    private LocalDateTime createdAt = LocalDateTime.now();
}
