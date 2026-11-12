package com.wildlife;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class WildlifeApplication {
    public static void main(String[] args) {
        SpringApplication.run(WildlifeApplication.class, args);
    }
}
