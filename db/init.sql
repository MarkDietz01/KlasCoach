CREATE DATABASE IF NOT EXISTS klassencoach CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE klassencoach;

CREATE TABLE IF NOT EXISTS students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  group_name VARCHAR(255) NULL,
  avatar_url VARCHAR(500) NULL,
  avatar_type ENUM('url','avataaars') NOT NULL DEFAULT 'url',
  avatar_config TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS point_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  delta INT NOT NULL,
  reason VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_point_student FOREIGN KEY (student_id) REFERENCES students(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS traffic_state (
  id INT PRIMARY KEY,
  state ENUM('green','orange','red') NOT NULL DEFAULT 'green',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
  `key` VARCHAR(100) PRIMARY KEY,
  `value` TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS point_presets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  label VARCHAR(100) NOT NULL,
  delta INT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO traffic_state (id, state, updated_at)
VALUES (1, 'green', NOW())
ON DUPLICATE KEY UPDATE state = VALUES(state), updated_at = VALUES(updated_at);

INSERT INTO point_presets (label, delta, is_active) VALUES
('+1', 1, 1),
('+2', 2, 1),
('-1', -1, 1)
ON DUPLICATE KEY UPDATE is_active = VALUES(is_active);

-- optionele voorbeeldleerlingen
INSERT INTO students (name, group_name, avatar_url, avatar_type, avatar_config, is_active) VALUES
('Anna', 'Tafel 1', NULL, 'url', NULL, 1),
('Bram', 'Tafel 1', NULL, 'url', NULL, 1),
('Cem', 'Tafel 2', NULL, 'url', NULL, 1),
('Daan', 'Tafel 2', NULL, 'url', NULL, 1);
