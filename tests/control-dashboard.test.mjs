import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPlayDashboard,
  dashboardFirmwareRequirements,
  parseDashboardTelemetry,
} from "../pilot/lib/control-dashboard.mjs";

const motionScreenProject = {
  projectTitle: "Room greeter",
  idea: "Show hello on the screen when someone enters the room.",
  summary: "A motion-controlled greeting.",
  parts: [
    { name: "ESP32 DevKit", role: "main board" },
    { name: "PIR sensor", role: "motion input" },
    { name: "OLED display", role: "shows the greeting" },
  ],
  pinAssignments: [
    { label: "PIR OUT", purpose: "motion input" },
    { label: "OLED SDA", purpose: "screen data" },
  ],
};

test("a motion-and-screen build gets controls matched to its real use", () => {
  const dashboard = buildPlayDashboard(motionScreenProject);
  assert.equal(dashboard.title, "Room greeter");
  assert.ok(dashboard.telemetry.some((item) => item.id === "motion"));
  assert.ok(dashboard.telemetry.some((item) => item.id === "screen"));
  assert.ok(dashboard.controls.some((control) => control.command === "MAKEABLE:DEMO:MOTION"));
  assert.ok(dashboard.controls.some((control) => control.commandPrefix === "MAKEABLE:SCREEN:TEXT="));
  assert.ok(dashboard.controls.some((control) => control.command === "MAKEABLE:SCREEN:CLEAR"));
});

test("temperature and fan projects get temperature telemetry and fan controls", () => {
  const dashboard = buildPlayDashboard({
    projectTitle: "Desk fan",
    idea: "Turn on a fan when the room gets warm.",
    parts: [
      { name: "DHT22", role: "temperature input" },
      { name: "Mini fan", role: "cooling output" },
    ],
  });
  assert.ok(dashboard.telemetry.some((item) => item.id === "temperature"));
  assert.ok(dashboard.telemetry.some((item) => item.id === "fan"));
  assert.ok(dashboard.controls.some((control) => control.command === "MAKEABLE:FAN:ON"));
  assert.ok(dashboard.controls.some((control) => control.command === "MAKEABLE:FAN:AUTO"));
  assert.ok(!dashboard.controls.some((control) => /SCREEN/.test(control.command || control.commandPrefix || "")));
});

test("live serial snapshots and familiar diagnostic lines become dashboard readings", () => {
  const updates = parseDashboardTelemetry([
    'MAKEABLE:DASHBOARD {"motion":"active","screen":"on","temperature":24.5}',
    "soil=ignored",
    "MOTION: 0",
    "distance=18",
  ].join("\n"));
  const values = Object.fromEntries(updates.map((update) => [update.id, update.value]));
  assert.equal(values.motion, "Room is still");
  assert.equal(values.screen, "On");
  assert.equal(values.temperature, "24.5 °C");
  assert.equal(values.distance, "18 cm");
});

test("firmware instructions expose the dashboard commands and live status contract", () => {
  const dashboard = buildPlayDashboard(motionScreenProject);
  const instructions = dashboardFirmwareRequirements(dashboard);
  assert.match(instructions, /MAKEABLE:STATUS\?/);
  assert.match(instructions, /MAKEABLE:DEMO:MOTION/);
  assert.match(instructions, /MAKEABLE:SCREEN:TEXT=<short text>/);
  assert.match(instructions, /MAKEABLE:DASHBOARD/);
  assert.match(instructions, /non-blocking/);
});
