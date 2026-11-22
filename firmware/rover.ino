
#include <Wire.h>
#include <SPI.h>
#include <LoRa.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

// ===== L298N MOTOR DRIVER =====
#define ENA 25
#define IN1 26
#define IN2 27
#define IN3 14
#define IN4 13
#define ENB 33

// ===== JOYSTICK =====
#define JOY_X 34
#define JOY_Y 35

// ===== WHEEL ENCODERS =====
#define LEFT_SENSOR 32
#define RIGHT_SENSOR 23

// ===== SX1278 LORA =====
#define LORA_SCK 18
#define LORA_MISO 19
#define LORA_MOSI 16
#define LORA_SS 17
#define LORA_RST 4
#define LORA_DIO0 36

Adafruit_MPU6050 mpu;
bool mpuReady = false;

volatile unsigned long leftPulses = 0;
volatile unsigned long rightPulses = 0;

unsigned long lastSend = 0;
unsigned long packetNumber = 0;

const int SPEED_PERCENT = 60;
const unsigned long SEND_INTERVAL = 500;

void IRAM_ATTR countLeft() {
  leftPulses++;
}

void IRAM_ATTR countRight() {
  rightPulses++;
}

void setMotor(int en, int a, int b, int speed) {
  speed = constrain(speed, -170, 170);

  if (speed > 0) {
    digitalWrite(a, HIGH);
    digitalWrite(b, LOW);
  } else if (speed < 0) {
    digitalWrite(a, LOW);
    digitalWrite(b, HIGH);
  } else {
    digitalWrite(a, LOW);
    digitalWrite(b, LOW);
  }

  ledcWrite(en, abs(speed));
}

void stopMotors() {
  setMotor(ENA, IN1, IN2, 0);
  setMotor(ENB, IN3, IN4, 0);
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  // Motors
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);

  ledcAttach(ENA, 1000, 8);
  ledcAttach(ENB, 1000, 8);
  stopMotors();

  // MPU6050
  Wire.begin(21, 22);
  mpuReady = mpu.begin();

  Serial.println(
    mpuReady ? "MPU6050 CONNECTED" :
               "MPU6050 NOT DETECTED"
  );

  // Wheel encoders
  pinMode(LEFT_SENSOR, INPUT_PULLUP);
  pinMode(RIGHT_SENSOR, INPUT_PULLUP);

  attachInterrupt(
    digitalPinToInterrupt(LEFT_SENSOR),
    countLeft,
    FALLING
  );

  attachInterrupt(
    digitalPinToInterrupt(RIGHT_SENSOR),
    countRight,
    FALLING
  );

  // LoRa
  SPI.begin(
    LORA_SCK,
    LORA_MISO,
    LORA_MOSI,
    LORA_SS
  );

  LoRa.setPins(
    LORA_SS,
    LORA_RST,
    LORA_DIO0
  );

  if (!LoRa.begin(433E6)) {
    Serial.println("LORA FAILED");
    stopMotors();
    while (true) delay(100);
  }

  LoRa.setTxPower(2);

  lastSend = millis();
  Serial.println("ROBOT READY");
}

void loop() {
  // ===== JOYSTICK CONTROL =====
  int x = analogRead(JOY_X) - 2048;
  int y = 2048 - analogRead(JOY_Y);

  if (abs(x) < 450) x = 0;
  if (abs(y) < 450) y = 0;

  int steering = map(x, -2048, 2047, -170, 170);
  int throttle = map(y, -2048, 2047, -170, 170);

  int leftSpeed = constrain(
    throttle + steering, -170, 170
  );

  int rightSpeed = constrain(
    throttle - steering, -170, 170
  );

  leftSpeed = leftSpeed * SPEED_PERCENT / 100;
  rightSpeed = rightSpeed * SPEED_PERCENT / 100;

  setMotor(ENA, IN1, IN2, leftSpeed);
  setMotor(ENB, IN3, IN4, rightSpeed);

  // ===== SEND SENSOR DATA =====
  if (millis() - lastSend >= SEND_INTERVAL) {
    unsigned long now = millis();
    float dt = (now - lastSend) / 1000.0f;
    lastSend = now;

    noInterrupts();
    unsigned long lp = leftPulses;
    unsigned long rp = rightPulses;
    leftPulses = 0;
    rightPulses = 0;
    interrupts();

    float leftRate = lp / dt;
    float rightRate = rp / dt;

    float ax = 0;
    float ay = 0;
    float az = 0;
    float gz = 0;

    if (mpuReady) {
      sensors_event_t a, g, temp;
      mpu.getEvent(&a, &g, &temp);

      ax = a.acceleration.x;
      ay = a.acceleration.y;
      az = a.acceleration.z;
      gz = g.gyro.z;
    }

    // CSV:
    // seq,leftRate,rightRate,ax,ay,az,gz,leftPWM,rightPWM

    String payload =
      String(packetNumber++) + "," +
      String(leftRate, 1) + "," +
      String(rightRate, 1) + "," +
      String(ax, 2) + "," +
      String(ay, 2) + "," +
      String(az, 2) + "," +
      String(gz, 2) + "," +
      String(leftSpeed) + "," +
      String(rightSpeed);

    LoRa.beginPacket();
    LoRa.print(payload);
    LoRa.endPacket();

    Serial.print("SENT: ");
    Serial.println(payload);
  }

  delay(20);
}
