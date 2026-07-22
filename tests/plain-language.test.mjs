import test from "node:test";
import assert from "node:assert/strict";

import {
  explainMessagesForChild,
  explainProjectForChild,
  explainRunningForChild,
  explainStartupForChild,
  friendlyPartName,
} from "../pilot/lib/plain-language.mjs";

const technicalMotionDisplayProject = {
  idea: "Show hello on the screen when someone enters the room.",
  summary: "A PIR-controlled OLED greeting.",
  behavior: "Initialize the I2C display, allow the PIR to settle after startup, monitor the PIR output, log motion state changes, and redraw the OLED.",
  pinAssignments: [
    { label: "OLED SDA", gpio: 21, purpose: "I2C data" },
    { label: "OLED SCL", gpio: 22, purpose: "I2C clock" },
    { label: "PIR OUT", gpio: 27, purpose: "motion input" },
  ],
  serialProtocol: ["BOOT", "MOTION:ACTIVE", "SCREEN:UPDATED"],
};

test("technical motion-display notes become child-friendly explanations", () => {
  const explanations = [
    explainProjectForChild(technicalMotionDisplayProject),
    explainStartupForChild(technicalMotionDisplayProject),
    explainRunningForChild(technicalMotionDisplayProject),
    explainMessagesForChild(technicalMotionDisplayProject),
  ];

  assert.match(explanations[0], /motion sensor watches the room/i);
  assert.match(explanations[0], /screen shows your message/i);
  assert.match(explanations[1], /board turns on/i);
  assert.match(explanations[2], /when someone moves/i);
  assert.match(explanations[3], /message window tells you/i);
  explanations.forEach((explanation) => {
    assert.doesNotMatch(explanation, /\b(?:PIR|I2C|OLED|SDA|SCL|GPIO|setup|loop|HIGH|LOW)\b/i);
  });
});

test("common hardware names are translated into everyday words", () => {
  assert.equal(friendlyPartName("PIR OUT on D27"), "motion sensor");
  assert.equal(friendlyPartName("OLED SCL on pin 22"), "screen");
  assert.equal(friendlyPartName("DHT22 temperature input"), "temperature sensor");
});

test("temperature projects explain the cause and response plainly", () => {
  const project = {
    idea: "Turn on a fan when the room gets warm.",
    behavior: "Read the DHT22 and drive the fan above the temperature threshold.",
    pinAssignments: [
      { label: "DHT22", purpose: "temperature input" },
      { label: "Fan", purpose: "cooling output" },
    ],
  };
  assert.equal(
    explainProjectForChild(project),
    "The temperature sensor checks the room. When the room gets warm, the fan turns on. When it cools down, the fan turns off.",
  );
});
