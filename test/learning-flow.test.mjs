import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExpectedBehaviorPrompt,
  buildLearningJournalMarkdown,
  getCorrectMoveAnswer,
  getCorrectWhyAnswer,
  isTypedMoveAnswerCorrect,
  isTypedWhyAnswerCorrect,
  normalizeLearningStep,
  summarizeFirmwareConcept,
  updateLearningJournalEntry,
} from "../learning-flow.js";

test("normalizes AI learning fields on a wiring step", () => {
  const step = normalizeLearningStep(
    {
      order: 2,
      title: "Connect LED signal",
      instruction: "Run a red jumper from GPIO 18 to the LED anode.",
      from: "ESP32 GPIO 18",
      to: "LED anode",
      pin: "GPIO 18",
      check: "The LED should stay off until motion is detected.",
      challengePrompt: "Which ESP32 pin should drive the LED?",
      hints: ["Find the output part.", "Look for the GPIO named in the plan."],
      conceptExplanation: "A GPIO pin acts like a controllable switch for the LED.",
      commonMistake: "Connecting the LED without a current-limiting resistor.",
      reflectionQuestion: "Why does the LED need a GPIO instead of power only?",
    },
    1,
  );

  assert.equal(step.order, 2);
  assert.equal(step.challengePrompt, "What is the next wiring move?");
  assert.equal(step.hints.length, 3);
  assert.match(step.hints[0], /output part/);
  assert.match(step.hints.at(-1), /GPIO 18.*LED anode/);
  assert.match(step.conceptExplanation, /controllable switch/);
  assert.match(step.commonMistake, /current-limiting resistor/);
  assert.match(step.reflectionQuestion, /GPIO/);
  assert.equal(step.moveChoices.filter((choice) => choice.isCorrect).length, 1);
  assert.match(step.moveChoices.find((choice) => choice.isCorrect).label, /GPIO 18.*LED anode/);
  assert.equal(step.whyChoices.filter((choice) => choice.isCorrect).length, 1);
});

test("creates useful learning fallbacks when old AI plans do not include them", () => {
  const step = normalizeLearningStep(
    {
      title: "Connect common ground",
      instruction: "Connect ESP32 GND to PIR GND.",
      from: "ESP32 GND",
      to: "PIR sensor GND",
      pin: "GND",
      check: "Both boards share ground.",
    },
    0,
  );

  assert.equal(step.order, 1);
  assert.match(step.challengePrompt, /first wiring move/i);
  assert.match(step.predictionQuestion, /reference|ground|boards/i);
  assert.doesNotMatch(step.challengePrompt, /ESP32 GND|PIR sensor GND/i);
  assert.doesNotMatch(step.predictionQuestion, /ESP32 GND|PIR sensor GND/i);
  assert.equal(step.hints.length, 3);
  assert.match(step.hints.at(-1), /ESP32 GND.*PIR sensor GND/i);
  assert.match(step.conceptExplanation, /Ground/i);
  assert.match(step.reflectionQuestion, /why/i);
  assert.equal(step.moveChoices.filter((choice) => choice.isCorrect).length, 1);
  assert(step.moveChoices.some((choice) => /don't know/i.test(choice.label)));
  assert.equal(step.whyChoices.filter((choice) => choice.isCorrect).length, 1);
});

test("checks typed beginner answers against the actual move and why concept", () => {
  const step = normalizeLearningStep(
    {
      title: "Connect common ground",
      instruction: "Connect ESP32 GND to PIR GND.",
      from: "ESP32 GND",
      to: "PIR sensor GND",
      pin: "GND",
      conceptExplanation: "A shared ground gives the PIR signal the same electrical reference as the ESP32 input.",
    },
    0,
  );

  assert.match(getCorrectMoveAnswer(step), /ESP32 GND.*PIR sensor GND/i);
  assert.match(getCorrectWhyAnswer(step), /ground reference|shared ground/i);
  assert.equal(isTypedMoveAnswerCorrect(step, "connect GND to GND between ESP32 and PIR"), true);
  assert.equal(isTypedMoveAnswerCorrect(step, "ESP32 5V to PIR signal"), false);
  assert.equal(isTypedWhyAnswerCorrect(step, "They need a shared ground reference so the signal can be read."), true);
  assert.equal(isTypedWhyAnswerCorrect(step, "Because black wires look neat."), false);
});

test("updates learning journal entries without losing earlier student work", () => {
  const step = normalizeLearningStep({ order: 1, title: "Connect signal" }, 0);
  const started = updateLearningJournalEntry({}, step, {
    prediction: "GPIO 18 should connect to the LED signal leg.",
  }, "2026-06-17T01:00:00.000Z");
  const updated = updateLearningJournalEntry(started, step, {
    hintsUsed: 2,
    revealed: true,
    reflection: "The GPIO controls when current can flow.",
  }, "2026-06-17T01:03:00.000Z");

  assert.equal(updated["1"].prediction, "GPIO 18 should connect to the LED signal leg.");
  assert.equal(updated["1"].hintsUsed, 2);
  assert.equal(updated["1"].revealed, true);
  assert.equal(updated["1"].reflection, "The GPIO controls when current can flow.");
  assert.equal(updated["1"].createdAt, "2026-06-17T01:00:00.000Z");
  assert.equal(updated["1"].updatedAt, "2026-06-17T01:03:00.000Z");
});

test("builds learning journal markdown for final project notes", () => {
  const steps = [
    normalizeLearningStep({ order: 1, title: "Connect signal", instruction: "Wire GPIO 18 to LED." }, 0),
  ];
  const journal = {
    1: {
      prediction: "I think GPIO 18 goes to the LED.",
      hintsUsed: 1,
      revealed: true,
      reflection: "A GPIO is the controllable output.",
      updatedAt: "2026-06-17T01:03:00.000Z",
    },
  };

  const markdown = buildLearningJournalMarkdown(journal, steps);

  assert.match(markdown, /## Learning Journal/);
  assert.match(markdown, /Connect signal/);
  assert.match(markdown, /I think GPIO 18/);
  assert.match(markdown, /Hints used: 1/);
  assert.match(markdown, /A GPIO is the controllable output/);
});

test("summarizes firmware purpose and expected behavior from the hardware plan", () => {
  const plan = {
    firmwareSpec: {
      behavior: "Turn on the LED when motion is detected.",
      libraries: ["Arduino"],
      pinAssignments: [
        { label: "PIR signal", gpio: 27, mode: "INPUT", purpose: "Read motion" },
        { label: "LED", gpio: 18, mode: "OUTPUT", purpose: "Show motion state" },
      ],
      serialProtocol: ["MOTION_DETECTED", "MOTION_CLEAR"],
    },
    diagnosticTests: [
      {
        name: "Motion test",
        userAction: "Wave in front of the PIR sensor.",
        expectedSerial: "MOTION_DETECTED",
      },
    ],
  };

  const concept = summarizeFirmwareConcept(plan);
  const expected = buildExpectedBehaviorPrompt(plan);

  assert.match(concept, /Turn on the LED/);
  assert.match(concept, /GPIO 27/);
  assert.match(concept, /MOTION_DETECTED/);
  assert.match(expected, /Wave in front/);
  assert.match(expected, /MOTION_DETECTED/);
});
