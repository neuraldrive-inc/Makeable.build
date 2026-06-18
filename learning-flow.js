export function normalizeLearningStep(step = {}, index = 0) {
  const order = Number.isFinite(Number(step.order)) ? Number(step.order) : index + 1;
  const normalized = {
    ...step,
    order,
    title: step.title || `Connection ${order}`,
    instruction: step.instruction || "",
    from: step.from || "",
    to: step.to || "",
    fromPartId: step.fromPartId || "",
    toPartId: step.toPartId || "",
    pin: step.pin || "",
    wireColor: step.wireColor || "",
    check: step.check || "",
  };

  normalized.aiChallengePrompt = cleanText(step.challengePrompt);
  normalized.challengePrompt = order === 1 ? "What is the first wiring move?" : "What is the next wiring move?";
  normalized.predictionQuestion = buildPredictionQuestion(normalized);
  normalized.hints = normalizeHints(step.hints, normalized);
  normalized.conceptExplanation =
    cleanText(step.conceptExplanation) || fallbackConceptExplanation(normalized);
  normalized.commonMistake =
    cleanText(step.commonMistake) || fallbackCommonMistake(normalized);
  normalized.reflectionQuestion =
    cleanText(step.reflectionQuestion) ||
    `Why does this connection matter for ${shortConnectionGoal(normalized)}?`;
  normalized.moveChoices = normalizeMoveChoices(step.moveChoices, normalized);
  normalized.whyChoices = normalizeWhyChoices(step.whyChoices, normalized);

  return normalized;
}

export function updateLearningJournalEntry(journal = {}, step = {}, patch = {}, timestamp = new Date().toISOString()) {
  const key = journalKey(step);
  const previous = journal[key] || {
    stepOrder: Number.isFinite(Number(step.order)) ? Number(step.order) : key,
    stepTitle: step.title || `Move ${key}`,
    prediction: "",
    hintsUsed: 0,
    revealed: false,
    reflection: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  return {
    ...journal,
    [key]: {
      ...previous,
      ...patch,
      hintsUsed: Math.max(0, Number(patch.hintsUsed ?? previous.hintsUsed ?? 0)),
      revealed: Boolean(patch.revealed ?? previous.revealed),
      updatedAt: timestamp,
    },
  };
}

export function buildLearningJournalMarkdown(journal = {}, wiringSteps = []) {
  const rows = wiringSteps.map((step, index) => {
    const normalized = normalizeLearningStep(step, index);
    const entry = journal[journalKey(normalized)] || {};
    const prediction = cleanText(entry.prediction) || "No prediction recorded.";
    const reflection = cleanText(entry.reflection) || "No reflection recorded.";
    const hintsUsed = Number(entry.hintsUsed || 0);
    const revealStatus = entry.revealed ? "Revealed after attempt" : "Not revealed in the journal";
    const selectedMove = choiceLabel(normalized.moveChoices, entry.predictionChoiceId);
    const selectedWhy = choiceLabel(normalized.whyChoices, entry.whyChoiceId);
    const moveResult = entry.predictionCorrect
      ? "Correct"
      : entry.correctionShown
        ? `Corrected to: ${getCorrectMoveAnswer(normalized)}`
        : "Not checked";
    const whyResult = entry.whyCorrect
      ? "Correct"
      : entry.whyCorrected
        ? `Corrected to: ${getCorrectWhyAnswer(normalized)}`
        : "Not checked";

    return [
      `### Move ${normalized.order}: ${normalized.title}`,
      "",
      `- Student prediction: ${prediction}`,
      `- Selected move choice: ${selectedMove || "No choice selected."}`,
      `- Move answer result: ${moveResult}`,
      `- Hints used: ${hintsUsed}`,
      `- Reveal status: ${revealStatus}`,
      `- Reflection: ${reflection}`,
      `- Selected why choice: ${selectedWhy || "No why choice selected."}`,
      `- Why answer result: ${whyResult}`,
      `- Final wiring: ${normalized.instruction || "No final wiring instruction recorded."}`,
    ].join("\n");
  });

  return [
    "## Learning Journal",
    "",
    rows.length
      ? rows.join("\n\n")
      : "No learning journal entries were recorded yet.",
  ].join("\n");
}

export function summarizeFirmwareConcept(plan = {}) {
  const spec = plan.firmwareSpec || {};
  const pins = Array.isArray(spec.pinAssignments) ? spec.pinAssignments : [];
  const libraries = Array.isArray(spec.libraries) ? spec.libraries : [];
  const serial = Array.isArray(spec.serialProtocol) ? spec.serialProtocol : [];
  const lines = [
    spec.behavior || plan.summary || "Create the guide first, then GeckCo will explain what the firmware controls.",
  ];

  if (pins.length) {
    lines.push(
      `Pin map: ${pins
        .map((pin) => `${pin.label || "part"} on GPIO ${pin.gpio ?? "?"} (${pin.mode || "mode"}: ${pin.purpose || "purpose"})`)
        .join("; ")}.`,
    );
  }
  if (libraries.length) lines.push(`Libraries: ${libraries.join(", ")}.`);
  if (serial.length) lines.push(`Serial markers to watch: ${serial.join(", ")}.`);
  return lines.join("\n");
}

export function buildExpectedBehaviorPrompt(plan = {}) {
  const tests = Array.isArray(plan.diagnosticTests) ? plan.diagnosticTests : [];
  if (!tests.length) {
    return "Before checking, predict what the board should print or do when the project is working.";
  }
  return tests
    .map((test) => {
      const action = test.userAction || test.purpose || "Try the project action.";
      const expected = test.expectedSerial || "the expected serial message";
      return `${test.name || "Check"}: ${action} Expected: ${expected}`;
    })
    .join("\n");
}

export function getCorrectMoveAnswer(step = {}) {
  const from = cleanText(step.from) || cleanText(step.fromPartId) || "the starting pin";
  const to = cleanText(step.to) || cleanText(step.toPartId) || "the matching pin";
  if (from && to) return `Connect ${from} to ${to}.`;
  return cleanText(step.instruction) || "Match the two pins named in the revealed wiring step.";
}

export function getCorrectWhyAnswer(step = {}) {
  const choices = Array.isArray(step.whyChoices) ? step.whyChoices : normalizeWhyChoices([], step);
  const correct = choices.find((choice) => choice.isCorrect);
  return correct?.label || fallbackWhyAnswer(step);
}

export function isTypedMoveAnswerCorrect(step = {}, text = "") {
  const answer = normalizeAnswerText(text);
  if (answer.length < 3) return false;

  const type = classifyStep(step);
  if (type === "ground" && /\b(common|shared)?\s*(ground|gnd)\s*(to|and|with|-)?\s*(ground|gnd)\b/.test(answer)) {
    return true;
  }

  const pinHit = containsConnectionLabel(answer, step.pin);
  const fromHit = containsConnectionLabel(answer, step.from) || containsConnectionLabel(answer, step.fromPartId);
  const toHit = containsConnectionLabel(answer, step.to) || containsConnectionLabel(answer, step.toPartId);
  const hasConnectionVerb = /\b(connect|wire|jumper|link|join|to|into|goes)\b|->/.test(answer);

  if (cleanText(step.pin)) {
    return Boolean(pinHit && (fromHit || toHit) && (hasConnectionVerb || fromHit || toHit));
  }
  return Boolean(fromHit && toHit && hasConnectionVerb);
}

export function isTypedWhyAnswerCorrect(step = {}, text = "") {
  const answer = normalizeAnswerText(text);
  if (answer.length < 8) return false;

  const type = classifyStep(step);
  if (type === "ground") {
    return (
      /\b(shared|common|same)\s+(ground|gnd|reference)\b/.test(answer) ||
      /\breference\b/.test(answer) ||
      (/\b(ground|gnd)\b/.test(answer) && /\b(signal|read|voltage|level|reference)\b/.test(answer))
    );
  }
  if (type === "power") {
    return /\b(power|voltage|supply|vcc|3v3|3 3v|turn on|run)\b/.test(answer);
  }
  if (type === "signal") {
    return /\b(signal|gpio|read|input|output|control|data)\b/.test(answer);
  }
  if (type === "resistor" || type === "led") {
    return /\b(resistor|current|limit|protect|polarity|direction|safe)\b/.test(answer);
  }

  const conceptTerms = importantTerms(step.conceptExplanation || fallbackConceptExplanation(step));
  const hits = conceptTerms.filter((term) => answer.includes(term));
  return hits.length >= Math.min(2, conceptTerms.length);
}

function normalizeHints(hints, step) {
  const cleanHints = Array.isArray(hints)
    ? hints.map(cleanText).filter(Boolean).slice(0, 3)
    : [];
  const from = cleanText(step.from) || cleanText(step.fromPartId) || "the starting side";
  const to = cleanText(step.to) || cleanText(step.toPartId) || "the matching side";
  const direct = `Direct answer: connect ${from} to ${to}.`;
  const fallbackHints = [
    `Start by finding ${from}.`,
    `Then find ${to}.`,
    direct,
  ];
  const chosenHints = cleanHints.length ? [...cleanHints.slice(0, 2), direct] : fallbackHints;
  return uniqueByText(chosenHints).slice(0, 3);
}

function buildPredictionQuestion(step) {
  const type = classifyStep(step);
  if (type === "ground") {
    return "Before the signal can be trusted, what reference should both boards share?";
  }
  if (type === "power") {
    return "After ground is shared, what kind of connection should safely power this part?";
  }
  if (type === "signal") {
    return "After power and ground, where should the signal wire go so the ESP32 can read or control the part?";
  }
  if (type === "resistor") {
    return "Where should the resistor sit so current has a safer path?";
  }
  if (type === "led") {
    return "Which connection completes the LED path so it can turn on safely?";
  }
  return "Based on the labels in the photo, what connection would you try next?";
}

function normalizeMoveChoices(choices, step) {
  const provided = normalizeProvidedChoices(choices, "move");
  if (provided.length >= 3 && provided.filter((choice) => choice.isCorrect).length === 1) {
    return ensureUnknownChoice(provided.slice(0, 3), step);
  }

  const correct = {
    id: "move-correct",
    label: getCorrectMoveAnswer(step),
    isCorrect: true,
    feedback: "Correct. Now explain why this move matters.",
  };
  const distractors = buildMoveDistractors(step).map((label, index) => ({
    id: `move-wrong-${index + 1}`,
    label,
    isCorrect: false,
    feedback: `Not this move. Correct answer: ${getCorrectMoveAnswer(step)}`,
  }));
  const ordered = insertCorrectChoice(distractors.slice(0, 3), correct, step.order);
  return ensureUnknownChoice(ordered, step);
}

function normalizeWhyChoices(choices, step) {
  const provided = normalizeProvidedChoices(choices, "why");
  if (provided.length >= 3 && provided.filter((choice) => choice.isCorrect).length === 1) {
    return provided.slice(0, 3);
  }

  const correct = {
    id: "why-correct",
    label: fallbackWhyAnswer(step),
    isCorrect: true,
    feedback: "Correct. Next move unlocked.",
  };
  const distractors = buildWhyDistractors(step).map((label, index) => ({
    id: `why-wrong-${index + 1}`,
    label,
    isCorrect: false,
    feedback: `Good try. Correct answer: ${correct.label}`,
  }));
  return insertCorrectChoice(distractors.slice(0, 2), correct, Number(step.order || 1) + 1).slice(0, 3);
}

function normalizeProvidedChoices(choices, prefix) {
  if (!Array.isArray(choices)) return [];
  return choices
    .map((choice, index) => ({
      id: cleanText(choice?.id) || `${prefix}-${index + 1}`,
      label: cleanText(choice?.label || choice?.text),
      isCorrect: Boolean(choice?.isCorrect),
      feedback: cleanText(choice?.feedback),
    }))
    .filter((choice) => choice.label);
}

function ensureUnknownChoice(choices, step) {
  const withoutUnknown = choices.filter((choice) => !/don'?t know|not sure/i.test(choice.label));
  return [
    ...withoutUnknown.slice(0, 3),
    {
      id: "move-unknown",
      label: "I don't know yet. Show me.",
      isCorrect: false,
      revealAnswer: true,
      feedback: `No problem. Correct answer: ${getCorrectMoveAnswer(step)}`,
    },
  ];
}

function insertCorrectChoice(distractors, correct, order = 1) {
  const options = uniqueChoiceObjects(distractors);
  const insertAt = Math.min(options.length, Math.max(0, Number(order || 1) % (options.length + 1)));
  options.splice(insertAt, 0, correct);
  return options;
}

function buildMoveDistractors(step) {
  const type = classifyStep(step);
  const fromPart = partOnly(step.from) || "ESP32";
  const toPart = partOnly(step.to) || "the other part";
  const pin = cleanPin(step.pin);
  const labels = {
    ground: [
      `Connect ${toPart} signal to ESP32 5V.`,
      `Connect ${toPart} VCC to ESP32 GND.`,
      "Use any nearby pin that fits the jumper.",
    ],
    power: [
      `Connect ${toPart} signal to ESP32 5V.`,
      `Connect ${toPart} VCC to ESP32 GND.`,
      "Power it from a random GPIO pin.",
    ],
    signal: [
      `Connect ${toPart} signal to ESP32 GND.`,
      `Connect ${toPart} VCC to ${pin || "the signal pin"}.`,
      "Use any open GPIO without checking the plan.",
    ],
    resistor: [
      "Skip the resistor and connect the LED straight to power.",
      "Put the resistor across two random pins.",
      "Use any wire color as the pin label.",
    ],
    led: [
      "Connect the LED without checking polarity.",
      "Connect both LED legs to power.",
      "Use any nearby pin that fits the jumper.",
    ],
    general: [
      `Connect ${fromPart} to a random open pin.`,
      "Connect power before checking labels.",
      "Use any nearby pin that fits the jumper.",
    ],
  };
  return labels[type] || labels.general;
}

function buildWhyDistractors(step) {
  const type = classifyStep(step);
  const labels = {
    ground: [
      "Ground is only for choosing black wire color.",
      "It makes the program upload faster.",
    ],
    power: [
      "Power wires only hold the parts in place.",
      "Any voltage is fine as long as the jumper fits.",
    ],
    signal: [
      "Signal wires are only for decoration.",
      "The ESP32 can read the sensor without a pin.",
    ],
    resistor: [
      "The resistor makes the LED brighter with unlimited current.",
      "The resistor is only there to label the wire.",
    ],
    led: [
      "LED legs work the same in either direction every time.",
      "The LED does not need a controlled current path.",
    ],
    general: [
      "The wire color is the only thing that matters.",
      "Any two pins work if the parts are close together.",
    ],
  };
  return labels[type] || labels.general;
}

function fallbackWhyAnswer(step) {
  const type = classifyStep(step);
  if (type === "ground") {
    return "Both parts need a shared ground reference so the ESP32 can read the signal correctly.";
  }
  if (type === "power") {
    return "The part needs the correct voltage before it can send or receive signals.";
  }
  if (type === "signal") {
    return "The signal wire goes to a GPIO pin so the ESP32 can read or control that part.";
  }
  if (type === "resistor") {
    return "The resistor limits current so the LED and ESP32 pin stay safer.";
  }
  if (type === "led") {
    return "The LED needs the right path so current flows safely when the ESP32 controls it.";
  }
  return cleanText(step.conceptExplanation) || fallbackConceptExplanation(step);
}

function fallbackConceptExplanation(step) {
  const text = `${step.pin} ${step.from} ${step.to} ${step.instruction}`.toLowerCase();
  if (/gnd|ground/.test(text)) {
    return "Ground gives all parts the same electrical reference, so signals can be read correctly.";
  }
  if (/3v3|3\.3v|vcc|vin|5v|power/.test(text)) {
    return "Power connections feed the module, but signals still need their own pins.";
  }
  if (/gpio|signal|input|output/.test(text)) {
    return "A GPIO pin is how the ESP32 reads a sensor or controls an output.";
  }
  return "This connection gives the circuit one required path for power, ground, or signal.";
}

function fallbackCommonMistake(step) {
  const text = `${step.pin} ${step.from} ${step.to} ${step.instruction}`.toLowerCase();
  if (/gnd|ground/.test(text)) return "Forgetting a shared ground can make correct-looking wiring fail.";
  if (/led/.test(text)) return "LEDs usually need the correct polarity and a current-limiting resistor.";
  if (/signal|gpio/.test(text)) return "A common mix-up is using a power pin where a signal GPIO is needed.";
  return "A common mistake is matching the part name but missing the exact pin label.";
}

function connectionLabel(step) {
  const from = step.from || step.fromPartId || "the first part";
  const to = step.to || step.toPartId || "the second part";
  const pin = step.pin ? ` using ${step.pin}` : "";
  return `${from} to ${to}${pin}`;
}

function shortConnectionGoal(step) {
  if (step.to) return step.to;
  if (step.from) return step.from;
  return "the circuit";
}

function journalKey(step) {
  const order = Number.isFinite(Number(step.order)) ? Number(step.order) : 1;
  return String(order);
}

function choiceLabel(choices = [], id = "") {
  if (!id) return "";
  return choices.find((choice) => choice.id === id)?.label || "";
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function uniqueByText(values = []) {
  const seen = new Set();
  return values.filter((value) => {
    const key = cleanText(value).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueChoiceObjects(choices = []) {
  const seen = new Set();
  return choices.filter((choice) => {
    const key = cleanText(choice.label).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function classifyStep(step = {}) {
  const text = normalizeAnswerText(
    [
      step.pin,
      step.from,
      step.to,
      step.title,
      step.instruction,
      step.conceptExplanation,
    ].join(" "),
  );
  if (/\b(gnd|ground)\b/.test(text)) return "ground";
  if (/\b(3v3|3 3v|vcc|vin|5v|power|voltage)\b/.test(text)) return "power";
  if (/\b(resistor|current limit)\b/.test(text)) return "resistor";
  if (/\b(led|anode|cathode)\b/.test(text)) return "led";
  if (/\b(gpio|signal|sig|out|input|output|data)\b/.test(text)) return "signal";
  return "general";
}

function partOnly(label = "") {
  return cleanText(label)
    .replace(/\b(GPIO\s*\d+|GND|GROUND|3V3|3\.3V|VCC|VIN|5V|OUT|SIG|SIGNAL|ANODE|CATHODE|PIN)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanPin(pin = "") {
  return cleanText(pin).replace(/\s+/g, " ");
}

function containsConnectionLabel(answer, label) {
  const normalized = normalizeAnswerText(label);
  if (!normalized) return false;
  if (answer.includes(normalized)) return true;
  const terms = importantTerms(label);
  if (!terms.length) return false;
  if (/^gpio\s*\d+/i.test(cleanText(label))) return terms.every((term) => answer.includes(term));
  return terms.some((term) => answer.includes(term));
}

function importantTerms(value = "") {
  const stop = new Set([
    "the",
    "a",
    "an",
    "pin",
    "pins",
    "wire",
    "wires",
    "jumper",
    "sensor",
    "module",
    "part",
    "connect",
    "connection",
    "to",
    "from",
    "and",
    "with",
    "this",
    "that",
  ]);
  return normalizeAnswerText(value)
    .split(" ")
    .filter((term) => term.length > 1 && !stop.has(term));
}

function normalizeAnswerText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/3\.3\s*v/g, "3v3")
    .replace(/3\.3/g, "3v3")
    .replace(/5\s*v/g, "5v")
    .replace(/gnd/g, "ground")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
