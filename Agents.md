# Project Rules: Communication-Aware Motion Safety Robot

## 1. System Overview
- **Goal:** Build a 2WD ESP32 robot with a laptop dashboard that monitors wireless link quality (RSSI, SNR, Packet Delivery Rate) across an arena and enforces motion safety.
- **Rover (ESP32 #1):** Controls 2 BO geared DC motors via L298N, reads 2 wheel speed sensors and an MPU6050 IMU, and communicates over 433 MHz LoRa.
- **Base Station (ESP32 #2):** Receives rover telemetry over 433 MHz LoRa, reads an analog thumb joystick, and communicates with the laptop dashboard via USB Serial.
- **Arena:** 120 cm × 80 cm divided into a 6 columns × 4 rows grid (24 cells, each ~20 cm × 20 cm), with one physical obstacle placed between two grid cells.

## 2. Strict Engineering Constraints
1. **Staged Development Only:** Never generate the entire project at once. Only execute the specific stage requested by the user.
2. **Configurable Pins:** All ESP32 GPIO assignments must live in a dedicated `config.h` file with clear comments. Never hardcode pin numbers inside logic files.
3. **No Invented Hardware:**
   - The exact wheel speed sensor model is not yet confirmed: write clean, well-documented interrupt-based pulse-counter stubs with `// TODO: Confirm sensor type (e.g., IR slot vs Hall effect)` markers.
   - Do not assume the 433 MHz LoRa module interface (SPI SX1278 vs UART E32): create an abstract `lora_link.h` interface with `// TODO: Select SPI or UART driver` placeholders.
4. **Safety First:**
   - Always include communication timeout watchdogs (stop motors immediately if no valid packet arrives within 500 ms).
   - Always include an immediate Emergency Stop (E-STOP) override that sets motor PWM/enable pins to 0.
5. **Beginner-Friendly Explanations:** After every stage, explain what each created file does in plain language and provide step-by-step testing instructions for a beginner robotics team.
