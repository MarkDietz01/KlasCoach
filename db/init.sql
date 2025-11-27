CREATE DATABASE IF NOT EXISTS klassencoach CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE klassencoach;

CREATE TABLE IF NOT EXISTS classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  class_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  group_name VARCHAR(255) NULL,
  avatar_url VARCHAR(500) NULL,
  avatar_type ENUM('url','avataaars') NOT NULL DEFAULT 'url',
  avatar_config TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_student_class FOREIGN KEY (class_id) REFERENCES classes(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS point_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  class_id INT NOT NULL,
  student_id INT NOT NULL,
  delta INT NOT NULL,
  reason VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_point_student FOREIGN KEY (student_id) REFERENCES students(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_point_class FOREIGN KEY (class_id) REFERENCES classes(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS traffic_state (
  class_id INT PRIMARY KEY,
  state ENUM('green','orange','red') NOT NULL DEFAULT 'green',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_traffic_class FOREIGN KEY (class_id) REFERENCES classes(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Backward compatibility: migrate legacy traffic_state table that used `id` instead of `class_id`
ALTER TABLE traffic_state ADD COLUMN IF NOT EXISTS class_id INT NULL;
UPDATE traffic_state SET class_id = id WHERE class_id IS NULL AND id IS NOT NULL;
ALTER TABLE traffic_state MODIFY class_id INT NOT NULL;
ALTER TABLE traffic_state DROP PRIMARY KEY;
ALTER TABLE traffic_state ADD PRIMARY KEY (class_id);
ALTER TABLE traffic_state DROP COLUMN IF EXISTS id;
ALTER TABLE traffic_state DROP FOREIGN KEY IF EXISTS fk_traffic_class;
ALTER TABLE traffic_state ADD CONSTRAINT fk_traffic_class FOREIGN KEY (class_id) REFERENCES classes(id)
  ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS settings (
  `key` VARCHAR(100) PRIMARY KEY,
  `value` TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS class_timers (
  class_id INT PRIMARY KEY,
  label VARCHAR(255) NULL,
  ends_at DATETIME NULL,
  CONSTRAINT fk_timer_class FOREIGN KEY (class_id) REFERENCES classes(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS point_presets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  class_id INT NOT NULL,
  label VARCHAR(100) NOT NULL,
  delta INT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_presets_class FOREIGN KEY (class_id) REFERENCES classes(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Session store table for express-mysql-session
CREATE TABLE IF NOT EXISTS sessions (
  session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  expires INT(11) UNSIGNED NOT NULL,
  data TEXT COLLATE utf8mb4_bin,
  PRIMARY KEY (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

INSERT INTO classes (id, name) VALUES
(1, 'Klas A'),
(2, 'Klas B')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO traffic_state (class_id, state, updated_at)
VALUES (1, 'green', NOW()), (2, 'green', NOW())
ON DUPLICATE KEY UPDATE state = VALUES(state), updated_at = VALUES(updated_at);

INSERT INTO class_timers (class_id, label, ends_at)
VALUES (1, NULL, NULL), (2, NULL, NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label), ends_at = VALUES(ends_at);

INSERT INTO point_presets (class_id, label, delta, is_active) VALUES
(1, '+1', 1, 1),
(1, '+2', 2, 1),
(1, '-1', -1, 1),
(2, '+1', 1, 1),
(2, '+2', 2, 1),
(2, '-1', -1, 1)
ON DUPLICATE KEY UPDATE is_active = VALUES(is_active), delta = VALUES(delta);

-- optionele voorbeeldleerlingen
INSERT INTO students (class_id, name, group_name, avatar_url, avatar_type, avatar_config, is_active) VALUES
(1, 'Anna', 'Tafel 1', NULL, 'url', NULL, 1),
(1, 'Bram', 'Tafel 1', NULL, 'url', NULL, 1),
(1, 'Cem', 'Tafel 2', NULL, 'url', NULL, 1),
(1, 'Daan', 'Tafel 2', NULL, 'url', NULL, 1);
