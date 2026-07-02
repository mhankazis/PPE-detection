-- --------------------------------------------------------
-- Database: `ppe_detection`
-- --------------------------------------------------------

CREATE DATABASE IF NOT EXISTS `ppe_detection` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `ppe_detection`;

-- --------------------------------------------------------
-- Table structure for table `users`
-- --------------------------------------------------------
CREATE TABLE `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(50) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` VARCHAR(20) NOT NULL DEFAULT 'operator',
  `email` VARCHAR(150) DEFAULT NULL,
  `pending_email` VARCHAR(150) DEFAULT NULL,
  `otp_code` VARCHAR(10) DEFAULT NULL,
  `otp_expires` TIMESTAMP NULL DEFAULT NULL,
  `otp_attempts` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default admin user: username=admin, password=admin123
INSERT INTO `users` (`username`, `password_hash`, `role`, `email`) VALUES
('admin', '$2b$12$8aL8lU02E9VEj3lI5CCxC.WJ96.JhRdsdrv6fvj7l5hfyOqbOlWF2', 'admin', '2241720240@student.polinema.ac.id');

-- --------------------------------------------------------
-- Table structure for table `students`
-- --------------------------------------------------------
CREATE TABLE `students` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `nim` VARCHAR(50) NOT NULL UNIQUE,
  `name` VARCHAR(100) NOT NULL,
  `kelas` VARCHAR(50) DEFAULT NULL,
  `photo_path` VARCHAR(255) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for table `cameras`
-- --------------------------------------------------------
CREATE TABLE `cameras` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `location` VARCHAR(100) DEFAULT NULL,
  `rtsp_url` VARCHAR(255) NOT NULL,
  `status` ENUM('active', 'inactive') DEFAULT 'active',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for table `logs`
-- --------------------------------------------------------
CREATE TABLE `logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `log_number` VARCHAR(50) NOT NULL UNIQUE,
  `violation_type` VARCHAR(50) NOT NULL,
  `camera_id` INT DEFAULT NULL,
  `image_path` VARCHAR(255) DEFAULT NULL,
  `student_id` INT DEFAULT NULL,
  `severity` VARCHAR(20) DEFAULT 'Low',
  `status` VARCHAR(20) DEFAULT 'Belum Dihukum',
  `timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`camera_id`) REFERENCES `cameras`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for table `face_embeddings`
-- Stores face embedding vectors per student (one row per dataset photo)
-- --------------------------------------------------------
CREATE TABLE `face_embeddings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `student_id` INT NOT NULL,
  `embedding` BLOB NOT NULL COMMENT 'Serialized numpy embedding vector (512 floats)',
  `photo_path` VARCHAR(255) DEFAULT NULL COMMENT 'Path to the source photo file',
  `photo_index` INT NOT NULL DEFAULT 0 COMMENT 'Order index for multiple photos per student',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE,
  INDEX `idx_student_id` (`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
