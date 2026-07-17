FROM node:22-bookworm-slim

ARG ARDUINO_CLI_VERSION=1.5.1
ARG ESP32_CORE_VERSION=3.3.5

ENV NODE_ENV=production \
    PORT=10000 \
    ARDUINO_CLI_PATH=/usr/local/bin/arduino-cli \
    ARDUINO_DIRECTORIES_DATA=/opt/arduino/data \
    ARDUINO_DIRECTORIES_DOWNLOADS=/opt/arduino/downloads \
    ARDUINO_DIRECTORIES_USER=/opt/arduino/user

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && curl --fail --location --retry 4 \
      "https://github.com/arduino/arduino-cli/releases/download/v${ARDUINO_CLI_VERSION}/arduino-cli_${ARDUINO_CLI_VERSION}_Linux_64bit.tar.gz" \
      | tar -xz -C /usr/local/bin arduino-cli \
    && chmod 0755 /usr/local/bin/arduino-cli \
    && mkdir -p /opt/arduino/data /opt/arduino/downloads /opt/arduino/user \
    && arduino-cli core update-index \
      --additional-urls https://espressif.github.io/arduino-esp32/package_esp32_index.json \
    && arduino-cli core install "esp32:esp32@${ESP32_CORE_VERSION}" \
      --additional-urls https://espressif.github.io/arduino-esp32/package_esp32_index.json \
    && arduino-cli lib install \
      "Adafruit Unified Sensor" \
      "DHT sensor library" \
      "Adafruit NeoPixel" \
      "ESP32Servo" \
      "Adafruit GFX Library" \
      "Adafruit SSD1306" \
      "ArduinoJson" \
      "PubSubClient"

# The ESP32 build recipes invoke Python at compile time.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 \
    && rm -rf /var/lib/apt/lists/*

ENV ARDUINO_COMPILE_JOBS=1 \
    MAX_CONCURRENT_COMPILES=1 \
    COMPILE_TIMEOUT_MS=300000

WORKDIR /app
COPY --chown=node:node . .
RUN mkdir -p /app/.makeable/builds && chown -R node:node /app/.makeable

USER node
EXPOSE 10000
CMD ["node", "server.mjs"]
