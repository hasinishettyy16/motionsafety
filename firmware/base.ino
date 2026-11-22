#include <SPI.h>
#include <LoRa.h>

#define LORA_SCK 18
#define LORA_MISO 19
#define LORA_MOSI 16
#define LORA_SS 17
#define LORA_RST 4
#define LORA_DIO0 36

unsigned long receivedCount = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);

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
    while (true) delay(100);
  }

  Serial.println("BASE STATION READY");
}

void loop() {
  int packetSize = LoRa.parsePacket();

  if (packetSize > 0) {
    String payload = "";

    while (LoRa.available()) {
      payload += (char)LoRa.read();
    }

    // Validate CSV has exactly 9 numeric fields
    int commas = 0;
    bool valid = payload.length() > 0;

    for (int i = 0; i < payload.length(); i++) {
      char c = payload[i];

      if (c == ',') {
        commas++;
      } else if (
        !isDigit(c) &&
        c != '-' &&
        c != '+' &&
        c != '.'
      ) {
        valid = false;
      }
    }

    if (!valid || commas != 8) {
      Serial.println("INVALID PACKET");
      return;
    }

    receivedCount++;

    Serial.print("{\"telemetry\":[");
    Serial.print(payload);

    Serial.print("],\"rssi\":");
    Serial.print(LoRa.packetRssi());

    Serial.print(",\"snr\":");
    Serial.print(LoRa.packetSnr(), 2);

    Serial.print(",\"receivedCount\":");
    Serial.print(receivedCount);

    Serial.println("}");
  }
}