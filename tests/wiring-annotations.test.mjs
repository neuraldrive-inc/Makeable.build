import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  cleanPinLabel,
  cubicBezierPoint,
  curvedArrowGeometry,
  friendlyWiringText,
} from "../lib/wiring-annotations.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("wiring copy uses beginner-friendly pin language without losing the signal name", () => {
  assert.equal(
    friendlyWiringText("Connect ESP32 GPIO22 to the OLED pin marked SCL."),
    "Connect ESP32 pin 22 to the OLED pin marked SCL.",
  );
  assert.equal(friendlyWiringText("Check GPIO pin 21 before powering on."), "Check pin 21 before powering on.");
  assert.equal(cleanPinLabel("GPIO22", "to OLED SCL"), "D22 / 22 · SCL");
  assert.equal(cleanPinLabel("GPIO21", "to OLED SDA"), "D21 / 21 · SDA");
  assert.equal(cleanPinLabel("GPIO22", "SCL after GND is already connected"), "D22 / 22 · SCL");
  assert.equal(cleanPinLabel("GPIO21", "Connect SDA, not SCL"), "D21 / 21 · SDA");
  assert.equal(cleanPinLabel("GPIO27", "Connect the PIR OUT to the ESP32"), "D27 / 27 · OUT");
  assert.equal(cleanPinLabel("ground"), "GND");
});

test("connector geometry produces a visible bounded curve instead of a short straight segment", () => {
  const start = { x: 320, y: 300 };
  const end = { x: 285, y: 245 };
  const curve = curvedArrowGeometry(start, end, {
    bounds: { x: 0, y: 0, width: 640, height: 480 },
    fromOutward: { x: -0.5, y: -1 },
    toOutward: { x: 0.5, y: 1 },
  });
  const straightMidpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const curveMidpoint = cubicBezierPoint(curve, 0.5);

  assert.ok(Math.hypot(curveMidpoint.x - straightMidpoint.x, curveMidpoint.y - straightMidpoint.y) > 25);
  assert.ok(curveMidpoint.x >= 0 && curveMidpoint.x <= 640);
  assert.ok(curveMidpoint.y >= 0 && curveMidpoint.y <= 480);
  assert.notDeepEqual(curve.control1, start);
  assert.notDeepEqual(curve.control2, end);
});

test("the production pilot and source annotation helpers stay synchronized", async () => {
  const [source, pilot] = await Promise.all([
    readFile(path.join(root, "lib", "wiring-annotations.mjs"), "utf8"),
    readFile(path.join(root, "pilot", "lib", "wiring-annotations.mjs"), "utf8"),
  ]);
  assert.equal(pilot, source);
});
