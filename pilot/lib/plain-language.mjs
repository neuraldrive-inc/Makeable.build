function normalized(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function joined(items) {
  if (items.length < 2) return items[0] || "the connected parts";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function projectText(project = {}) {
  return normalized([
    project.idea,
    project.summary,
    project.behavior,
    ...(project.pinAssignments || []).map((assignment) => `${assignment.label || ""} ${assignment.purpose || ""}`),
    ...(project.serialProtocol || []),
  ].join(" ")).toLowerCase();
}

export function friendlyPartName(value) {
  const text = normalized(value).toLowerCase();
  if (!text) return "connected part";
  if (/\bpir\b|motion/.test(text)) return "motion sensor";
  if (/oled|display|screen|\bsda\b|\bscl\b|\bi2c\b/.test(text)) return "screen";
  if (/dht|temperature|therm/.test(text)) return "temperature sensor";
  if (/soil|moisture/.test(text)) return "soil sensor";
  if (/distance|ultrasonic|sonar/.test(text)) return "distance sensor";
  if (/light sensor|photoresistor|\bldr\b/.test(text)) return "light sensor";
  if (/button|switch/.test(text)) return "button";
  if (/water pump|\bpump\b/.test(text)) return "water pump";
  if (/\bfan\b/.test(text)) return "fan";
  if (/servo|motor/.test(text)) return "motor";
  if (/\bled\b|lamp|light/.test(text)) return "light";
  if (/buzzer|speaker|sound/.test(text)) return "speaker";
  if (/feeder|food/.test(text)) return "feeder";
  if (/esp32|controller|main board|microcontroller/.test(text)) return "board";
  return "connected part";
}

function projectParts(project = {}) {
  const parts = (project.pinAssignments || [])
    .map((assignment) => friendlyPartName(`${assignment.label || ""} ${assignment.purpose || ""}`))
    .filter((part) => part !== "connected part" && part !== "board");
  return [...new Set(parts)].sort((a, b) => {
    const order = ["motion sensor", "temperature sensor", "soil sensor", "distance sensor", "light sensor", "button", "screen", "light", "fan", "water pump", "motor", "speaker", "feeder"];
    return order.indexOf(a) - order.indexOf(b);
  });
}

function facts(project = {}) {
  const text = projectText(project);
  const parts = projectParts(project);
  const has = (pattern, part) => pattern.test(text) || parts.includes(part);
  return {
    text,
    parts,
    motion: has(/\bpir\b|motion/, "motion sensor"),
    screen: has(/oled|display|screen|\bi2c\b/, "screen"),
    temperature: has(/temperature|\bdht\b|warm|heat/, "temperature sensor"),
    soil: has(/soil|moisture|dry plant/, "soil sensor"),
    distance: has(/distance|ultrasonic|sonar/, "distance sensor"),
    lightSensor: has(/light sensor|photoresistor|\bldr\b/, "light sensor"),
    button: has(/button|switch/, "button"),
    fan: has(/\bfan\b/, "fan"),
    pump: has(/water pump|\bpump\b|watering/, "water pump"),
    light: has(/\bled\b|lamp|light/, "light"),
    motor: has(/servo|motor/, "motor"),
    speaker: has(/buzzer|speaker|sound/, "speaker"),
    feeder: has(/feeder|feeding|food/, "feeder"),
  };
}

export function explainProjectForChild(project = {}) {
  const info = facts(project);
  const idea = normalized(project.idea).toLowerCase();

  if (info.motion && info.screen) {
    const action = /hello|message|greeting|text/.test(idea)
      ? "the screen shows your message"
      : /turn[^.]{0,35}screen[^.]{0,20}on|screen[^.]{0,20}turn[^.]{0,20}on/.test(info.text)
        ? "the screen turns on"
        : "the screen updates";
    const ending = /turn[^.]{0,35}off|inactive|no motion|waiting|armed|clear state/.test(info.text)
      ? "When the room is still again, the screen goes back to waiting."
      : "The screen only changes when the movement changes.";
    return `The motion sensor watches the room. When it notices movement, ${action}. ${ending}`;
  }

  if (info.motion && info.light) {
    return "The motion sensor watches the room. When it notices movement, the light turns on. When the room is still again, the light turns off.";
  }

  if (info.temperature && info.fan) {
    return "The temperature sensor checks the room. When the room gets warm, the fan turns on. When it cools down, the fan turns off.";
  }

  if (info.soil && info.pump) {
    return "The soil sensor checks whether the plant is dry. When the plant needs water, the water pump turns on. It stops when watering is finished.";
  }

  if (info.button && info.screen) {
    return "The board waits for you to press the button. When you press it, the screen changes to show the next message or view.";
  }

  if (info.feeder || (info.motor && /feed|food/.test(info.text))) {
    return "The board waits for the feeding time. Then it runs the feeder and stops when the food has been served.";
  }

  const input = info.parts.find((part) => /sensor|button/.test(part));
  const output = info.parts.find((part) => !/sensor|button/.test(part));
  if (input && output) {
    return `The ${input} keeps watch. When it notices a change, the board updates the ${output}.`;
  }

  return "The board watches the connected parts and follows the job you asked it to do. It responds whenever something important changes.";
}

export function explainStartupForChild(project = {}) {
  const parts = projectParts(project);
  return parts.length
    ? `When the board turns on, it gets the ${joined(parts.slice(0, 3))} ready.`
    : "When the board turns on, it gets the connected parts ready.";
}

export function explainRunningForChild(project = {}) {
  const info = facts(project);
  if (info.motion && info.screen) return "It keeps watching the motion sensor. When someone moves, it updates the screen.";
  if (info.motion && info.light) return "It keeps watching the motion sensor. When someone moves, it turns the light on or off.";
  if (info.temperature && info.fan) return "It keeps checking the temperature. When the room gets warmer or cooler, it turns the fan on or off.";
  if (info.soil && info.pump) return "It keeps checking the soil. When the plant is dry, it runs the water pump.";
  const input = info.parts.find((part) => /sensor|button/.test(part));
  const output = info.parts.find((part) => !/sensor|button/.test(part));
  if (input && output) return `It keeps checking the ${input}. When something changes, it updates the ${output}.`;
  return "It keeps checking the connected parts and responds when something changes.";
}

export function explainMessagesForChild(project = {}) {
  const info = facts(project);
  const events = ["when the board starts"];
  if (info.motion) events.push("when movement is noticed");
  else if (info.temperature) events.push("when the temperature changes");
  else if (info.soil) events.push("when the plant needs water");
  if (info.screen) events.push("when the screen changes");
  else if (info.fan) events.push("when the fan changes");
  else if (info.pump) events.push("when watering starts or stops");
  else if (info.light) events.push("when the light changes");
  return `The message window tells you ${joined(events.slice(0, 3))}.`;
}
