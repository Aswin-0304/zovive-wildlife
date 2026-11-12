-- Reference schema. Spring Data JPA (ddl-auto=update) creates these tables automatically.
CREATE DATABASE IF NOT EXISTS wildlife;
USE wildlife;

CREATE TABLE IF NOT EXISTS cameras (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  camera_name VARCHAR(100) NOT NULL,
  location VARCHAR(255),
  status VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS detections (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  species VARCHAR(100) NOT NULL,
  confidence DOUBLE,
  location VARCHAR(255),
  detected_at DATETIME(6) NOT NULL,
  camera_id BIGINT
);

CREATE TABLE IF NOT EXISTS alerts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  detection_id BIGINT,
  alert_type VARCHAR(255) NOT NULL,
  status VARCHAR(50),
  created_at DATETIME(6)
);

CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL UNIQUE,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  user_role VARCHAR(32) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
);

CREATE TABLE IF NOT EXISTS revoked_jwts (
  token_id VARCHAR(36) PRIMARY KEY,
  expires_at TIMESTAMP(6) NOT NULL
);
