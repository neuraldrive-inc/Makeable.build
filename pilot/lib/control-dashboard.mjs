import { friendlyPartName } from "./plain-language.mjs";

function normalized(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function projectText(project = {}) {
  return normalized([
    project.idea,
    project.summary,
    project.behavior,
    ...(project.parts || []).map((part) => `${part.name || ""} ${part.type || ""} ${part.role || ""}`),
    ...(project.pinAssignments || []).map((pin) => `${pin.label || ""} ${pin.purpose || ""}`),
  ].join(" ")).toLowerCase();
}

function projectKinds(project = {}) {
  const candidates = [
    ...(project.parts || []).map((part) => `${part.name || ""} ${part.type || ""} ${part.role || ""}`),
    ...(project.pinAssignments || []).map((pin) => `${pin.label || ""} ${pin.purpose || ""}`),
  ];
  return new Set(candidates.map(friendlyPartName).filter((kind) => !["connected part", "board"].includes(kind)));
}

function facts(project = {}) {
  const text = projectText(project);
  const kinds = projectKinds(project);
  const has = (kind, pattern) => kinds.has(kind) || pattern.test(text);
  return {
    motion: has("motion sensor", /\bpir\b|motion sensor|movement/),
    screen: has("screen", /oled|display|screen/),
    temperature: has("temperature sensor", /temperature|\bdht\b|therm/),
    soil: has("soil sensor", /soil|moisture/),
    distance: has("distance sensor", /distance|ultrasonic|sonar/),
    lightSensor: has("light sensor", /light sensor|photoresistor|\bldr\b/),
    button: has("button", /button|switch/),
    fan: has("fan", /\bfan\b/),
    pump: has("water pump", /water pump|\bpump\b|watering/),
    light: kinds.has("light") || /\bled\b|lamp/.test(text),
    motor: has("motor", /servo|motor/),
    speaker: has("speaker", /buzzer|speaker|sound/),
    feeder: has("feeder", /feeder|feeding|serve food/),
  };
}

function telemetry(id, label, initial, detail, icon) {
  return { id, label, initial, detail, icon };
}

function button(id, label, description, command, feedback, preview = {}) {
  return { id, type: "button", label, description, command, feedback, preview };
}

function textControl(id, label, description, commandPrefix, placeholder, actionLabel, feedback) {
  return { id, type: "text", label, description, commandPrefix, placeholder, actionLabel, feedback };
}

export function buildPlayDashboard(project = {}) {
  const info = facts(project);
  const telemetryItems = [];
  const controls = [];

  if (info.motion) {
    telemetryItems.push(telemetry("motion", "Room activity", "Waiting", "Updates when movement changes", "↗"));
    controls.push(button(
      "demo-motion",
      "Pretend someone moved",
      "Run the same response without walking past the sensor.",
      "MAKEABLE:DEMO:MOTION",
      "Movement demo sent",
      { motion: "Movement noticed", screen: info.screen ? "Showing the project message" : undefined },
    ));
  }

  if (info.temperature) {
    telemetryItems.push(telemetry("temperature", "Room temperature", "Waiting", "Live reading from the temperature sensor", "°"));
  }
  if (info.soil) {
    telemetryItems.push(telemetry("soil", "Soil moisture", "Waiting", "Shows when the plant needs water", "◌"));
  }
  if (info.distance) {
    telemetryItems.push(telemetry("distance", "Distance", "Waiting", "Live distance from the sensor", "↔"));
  }
  if (info.lightSensor) {
    telemetryItems.push(telemetry("brightness", "Room brightness", "Waiting", "Live light level", "☼"));
  }

  if (info.screen) {
    telemetryItems.push(telemetry("screen", "Screen", "Ready", "Shows what is currently on the display", "▣"));
    controls.push(textControl(
      "screen-message",
      "Change the screen message",
      "Type a short message and send it to the screen.",
      "MAKEABLE:SCREEN:TEXT=",
      "Hello from Makeable!",
      "Show message",
      "Screen message sent",
    ));
    controls.push(button(
      "clear-screen",
      "Clear the screen",
      "Blank the screen without changing the project code.",
      "MAKEABLE:SCREEN:CLEAR",
      "Screen cleared",
      { screen: "Cleared" },
    ));
  }

  if (info.fan) {
    telemetryItems.push(telemetry("fan", "Fan", "Automatic", "Shows whether the fan is running", "✺"));
    controls.push(button("fan-on", "Turn the fan on", "Run the fan now.", "MAKEABLE:FAN:ON", "Fan turned on", { fan: "On" }));
    controls.push(button("fan-auto", "Return to automatic", "Let the temperature control the fan again.", "MAKEABLE:FAN:AUTO", "Fan returned to automatic", { fan: "Automatic" }));
  }

  if (info.pump) {
    telemetryItems.push(telemetry("pump", "Water pump", "Ready", "Shows when watering starts and stops", "≈"));
    controls.push(button("water-now", "Water now", "Run one short watering cycle.", "MAKEABLE:PUMP:RUN", "Watering started", { pump: "Watering" }));
    controls.push(button("stop-water", "Stop watering", "Stop the water pump safely.", "MAKEABLE:PUMP:STOP", "Watering stopped", { pump: "Stopped" }));
  }

  if (info.light) {
    telemetryItems.push(telemetry("light", "Light", "Automatic", "Shows whether the light is on", "☀"));
    controls.push(button("light-on", "Turn the light on", "Switch the light on now.", "MAKEABLE:LIGHT:ON", "Light turned on", { light: "On" }));
    controls.push(button("light-off", "Turn the light off", "Switch the light off now.", "MAKEABLE:LIGHT:OFF", "Light turned off", { light: "Off" }));
  }

  if (info.motor || info.feeder) {
    telemetryItems.push(telemetry("motor", info.feeder ? "Feeder" : "Motor", "Ready", "Shows when the mechanism is moving", "↻"));
    controls.push(button("run-motor", info.feeder ? "Serve one portion" : "Run the motor once", "Run one safe movement.", "MAKEABLE:MOTOR:RUN", info.feeder ? "Serving one portion" : "Motor started", { motor: "Running once" }));
    controls.push(button("stop-motor", "Stop the motor", "Stop the movement now.", "MAKEABLE:MOTOR:STOP", "Motor stopped", { motor: "Stopped" }));
  }

  if (info.speaker) {
    telemetryItems.push(telemetry("speaker", "Speaker", "Ready", "Shows when a sound is playing", "♪"));
    controls.push(button("play-sound", "Play a test sound", "Play one short sound.", "MAKEABLE:SOUND:PLAY", "Test sound played", { speaker: "Playing" }));
  }

  if (info.button) {
    controls.unshift(button("demo-button", "Pretend the button was pressed", "Try the button action from this dashboard.", "MAKEABLE:DEMO:BUTTON", "Button demo sent", { button: "Pressed" }));
  }

  if (!telemetryItems.length) {
    telemetryItems.push(telemetry("board", "Board", "Ready", "Shows when the board replies", "●"));
  }
  telemetryItems.push(telemetry("lastAction", "Last action", "Nothing yet", "Your most recent dashboard action", "✓"));

  if (!controls.length) {
    controls.push(button("ping-board", "Ask the board to reply", "Check that the live connection is working.", "MAKEABLE:PING", "Ping sent", { board: "Ping sent" }));
  }

  return {
    title: normalized(project.projectTitle) || "Your Makeable build",
    summary: normalized(project.summary || project.behavior) || "Live controls chosen for the parts in this project.",
    telemetry: telemetryItems.slice(0, 5),
    controls: controls.slice(0, 5),
  };
}

function telemetryId(rawKey) {
  const key = normalized(rawKey).toLowerCase();
  if (/pir|motion|movement/.test(key)) return "motion";
  if (/oled|display|screen/.test(key)) return "screen";
  if (/temp/.test(key)) return "temperature";
  if (/soil|moisture/.test(key)) return "soil";
  if (/distance|range/.test(key)) return "distance";
  if (/brightness|light[_ -]?level|ldr/.test(key)) return "brightness";
  if (/fan/.test(key)) return "fan";
  if (/pump|water/.test(key)) return "pump";
  if (/motor|servo|feeder/.test(key)) return "motor";
  if (/speaker|buzzer|sound/.test(key)) return "speaker";
  if (/\blight\b|\bled\b/.test(key)) return "light";
  if (/button|switch/.test(key)) return "button";
  if (/board|status|ready/.test(key)) return "board";
  return key.replace(/[^a-z0-9]+/g, "-");
}

function readableTelemetryValue(id, rawValue) {
  const value = normalized(rawValue);
  const lower = value.toLowerCase();
  const on = /^(1|on|true|active|detected|moving|running|open)$/.test(lower);
  const off = /^(0|off|false|inactive|still|stopped|closed|clear)$/.test(lower);
  if (id === "motion") return on ? "Movement noticed" : off ? "Room is still" : value;
  if (["screen", "fan", "pump", "light", "motor", "speaker"].includes(id)) return on ? "On" : off ? "Off" : value;
  if (id === "temperature" && /^-?\d+(\.\d+)?$/.test(value)) return `${value} °C`;
  if (id === "soil" && /^\d+(\.\d+)?$/.test(value)) return `${value}%`;
  if (id === "distance" && /^\d+(\.\d+)?$/.test(value)) return `${value} cm`;
  if (id === "brightness" && /^\d+(\.\d+)?$/.test(value)) return `${value}%`;
  return value || "Updated";
}

export function parseDashboardTelemetry(text) {
  const updates = new Map();
  const add = (key, value) => {
    const id = telemetryId(key);
    if (!id) return;
    updates.set(id, { id, value: readableTelemetryValue(id, value) });
  };

  for (const line of String(text || "").split(/\r?\n/)) {
    const jsonMatch = line.match(/MAKEABLE:(?:DASHBOARD|TELEMETRY)\s+(\{.*\})/i);
    if (jsonMatch) {
      try {
        Object.entries(JSON.parse(jsonMatch[1])).forEach(([key, value]) => add(key, value));
      } catch {
        // A partial serial line will be retried when the next chunk arrives.
      }
    }
    const stateMatch = line.match(/MAKEABLE:STATE\s+(.+)/i);
    if (stateMatch) {
      for (const pair of stateMatch[1].split(/\s+/)) {
        const [key, value] = pair.split("=");
        if (key && value != null) add(key, value);
      }
    }

    if (/\b(?:no motion|motion inactive|motion[:=]\s*(?:0|off|still))\b/i.test(line)) add("motion", "still");
    else if (/\b(?:motion detected|motion active|motion[:=]\s*(?:1|on|active))\b/i.test(line)) add("motion", "active");

    const numericPatterns = [
      ["temperature", /\b(?:temp|temperature)[:=]\s*(-?\d+(?:\.\d+)?)/i],
      ["soil", /\b(?:soil|moisture)[:=]\s*(\d+(?:\.\d+)?)/i],
      ["distance", /\b(?:distance|range)[:=]\s*(\d+(?:\.\d+)?)/i],
      ["brightness", /\b(?:brightness|light level)[:=]\s*(\d+(?:\.\d+)?)/i],
    ];
    numericPatterns.forEach(([key, pattern]) => {
      const match = line.match(pattern);
      if (match) add(key, match[1]);
    });
  }

  return [...updates.values()];
}

export function dashboardFirmwareRequirements(model) {
  const controls = model?.controls || [];
  const commandLines = controls.map((control) => {
    const command = control.type === "text" ? `${control.commandPrefix}<short text>` : control.command;
    return `  - ${command}: ${control.description}`;
  });
  return [
    "- Add a non-blocking line-based USB Serial command handler for the Makeable Play dashboard.",
    "- Always support MAKEABLE:STATUS? and MAKEABLE:PING.",
    ...commandLines,
    "- MAKEABLE:STATUS? must print one line beginning with MAKEABLE:DASHBOARD followed by valid compact JSON containing the current sensor and output states.",
    "- Also print that MAKEABLE:DASHBOARD snapshot after startup and whenever a visible state changes.",
    "- Keep reading sensors while waiting for commands; never block the main loop waiting for Serial input.",
    "- Ignore unknown MAKEABLE commands safely and print MAKEABLE:ERROR with a short reason.",
  ].join("\n");
}
