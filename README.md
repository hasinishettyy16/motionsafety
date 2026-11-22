# Motion-safety-robot
An educational robotics project exploring communication-aware rover navigation, wireless telemetry, obstacle-aware route planning, and radio signal mapping using ESP32, LoRa, sensors, and a web dashboard.


# Motion Safety Robot

## Overview

Motion Safety Robot is an educational robotics project exploring the relationship between rover movement, wireless communication reliability, obstacles, and navigation.

The project combines a mobile robotic platform with ESP32-based control, LoRa wireless telemetry, sensor data collection, and a software dashboard for visualizing robot and communication information.

The goal is to explore communication-aware navigation and understand how communication conditions can influence a robot's movement and route decisions.

## Project Components

- **Mobile Rover:** Two-wheel-drive robotic platform.
- **Microcontrollers:** ESP32 development boards for rover and base station.
- **Wireless Communication:** LoRa-based telemetry communication.
- **Motor Control:** L298N motor driver.
- **Sensors:** Wheel encoders and MPU6050 IMU.
- **Dashboard:** Browser-based interface for grid visualization, navigation concepts, telemetry, and robot monitoring.
- **Radio Survey Tool:** Manual grid-based data collection module for recording communication measurements at different arena positions and conditions.

## Arena

The test arena is represented as a 6 × 4 grid.

- Cell dimensions: 20 × 20 cm
- Arena dimensions: 120 × 80 cm
- Grid columns: A–F
- Grid rows: 1–4
- Obstacle locations: C2 and C3

## Software

The software workspace includes:

- Dashboard and grid visualization
- Navigation and path-planning logic
- Telemetry processing
- Stage 6 manual radio survey tool
- ESP32 rover and base firmware
- CSV-based survey data collection

## Project Status

This project is currently under development and testing. Software modules, wireless communication, sensor readings, hardware integration, and navigation behavior are being progressively verified.

Simulation and test data should be distinguished from measurements collected from the physical robot.

## Objective

To investigate how wireless communication measurements and obstacles can be incorporated into robot navigation and monitoring, while building an integrated educational robotics system.

## Technologies

- ESP32
- Arduino / C++
- LoRa
- HTML
- CSS
- JavaScript
- Python
- CSV data analysis

---

*Developed as an educational robotics and engineering project.*
