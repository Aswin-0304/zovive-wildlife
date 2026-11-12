package com.wildlife.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "cameras")
@Getter @Setter @NoArgsConstructor
public class Camera {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @NotBlank
    private String cameraName;
    private String location;
    // ACTIVE or INACTIVE
    private String status = "ACTIVE";
}
