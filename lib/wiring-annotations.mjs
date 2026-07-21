const SIGNAL_LABELS = [
  "SCL",
  "SDA",
  "CLK",
  "SCK",
  "MOSI",
  "MISO",
  "CS",
  "RX",
  "TX",
  "PWM",
  "ADC",
  "OUT",
  "DATA",
  "TRIG",
  "ECHO",
  "DIN",
  "DOUT",
];

export function friendlyWiringText(value) {
  return String(value || "")
    .replace(/\bGPIO(?:_NUM_|\s+PIN\s*|\s*)([0-9]{1,2})\b/gi, "pin $1")
    .replace(/\bpin\s+pin\s+([0-9]{1,2})\b/gi, "pin $1")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanPinLabel(value, context = "") {
  const text = friendlyWiringText(value || "wire");
  const upper = text.toUpperCase();
  const contextUpper = friendlyWiringText(context).toUpperCase();
  if (/\bGND\b|GROUND/.test(upper)) return "GND";
  if (/\b3V3\b|\b3\.3V\b|\bVCC\b|\bVIN\b|\b5V\b/.test(upper)) {
    return upper.match(/3V3|3\.3V|VCC|VIN|5V/)?.[0] || "VCC";
  }

  const pin = upper.match(/\bPIN\s*([0-9]{1,2})\b/) || upper.match(/\bD([0-9]{1,2})\b/);
  const signalText = `${upper} ${contextUpper}`;
  const signal = firstSignalLabel(signalText);
  if (pin) return [`D${pin[1]} / ${pin[1]}`, signal].filter(Boolean).join(" · ");
  if (signal) return signal;
  return text.slice(0, 18);
}

function firstSignalLabel(text) {
  return SIGNAL_LABELS.map((label) => ({ label, index: text.search(new RegExp(`\\b${label}\\b`)) }))
    .filter(({ index }) => index >= 0)
    .sort((a, b) => a.index - b.index)[0]?.label;
}

export function curvedArrowGeometry(start, end, options = {}) {
  const bounds = options.bounds || { x: 0, y: 0, width: 1000, height: 1000 };
  const obstacles = Array.isArray(options.obstacles) ? options.obstacles : [];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const normal = { x: -dy / distance, y: dx / distance };
  const maxBend = Math.max(46, Math.min(112, Math.min(bounds.width, bounds.height) * 0.24));
  const bend = clamp(distance * 0.46, 46, maxBend);

  const candidates = [-1, 1].map((sign) => {
    const control1 = {
      x: start.x + dx * 0.28 + normal.x * bend * sign,
      y: start.y + dy * 0.28 + normal.y * bend * sign,
    };
    const control2 = {
      x: end.x - dx * 0.28 + normal.x * bend * sign,
      y: end.y - dy * 0.28 + normal.y * bend * sign,
    };
    const curve = { start, control1, control2, end };
    return {
      ...curve,
      labelPoint: cubicBezierPoint(curve, 0.5),
      score: scoreCurve(curve, bounds, obstacles, options.fromOutward, options.toOutward),
    };
  });

  const selected = candidates.sort((a, b) => b.score - a.score)[0];
  return {
    start: selected.start,
    control1: selected.control1,
    control2: selected.control2,
    end: selected.end,
    labelPoint: selected.labelPoint,
  };
}

export function cubicBezierPoint(curve, t) {
  const inverse = 1 - t;
  const inverseSquared = inverse * inverse;
  const tSquared = t * t;
  return {
    x:
      inverseSquared * inverse * curve.start.x +
      3 * inverseSquared * t * curve.control1.x +
      3 * inverse * tSquared * curve.control2.x +
      tSquared * t * curve.end.x,
    y:
      inverseSquared * inverse * curve.start.y +
      3 * inverseSquared * t * curve.control1.y +
      3 * inverse * tSquared * curve.control2.y +
      tSquared * t * curve.end.y,
  };
}

function scoreCurve(curve, bounds, obstacles, fromOutward, toOutward) {
  let score = 0;
  score += tangentAlignment(curve.start, curve.control1, fromOutward) * 180;
  score += tangentAlignment(curve.end, curve.control2, toOutward) * 180;

  for (const t of [0.18, 0.34, 0.5, 0.66, 0.82]) {
    const point = cubicBezierPoint(curve, t);
    const margin = pointBoundsMargin(point, bounds);
    score += Math.min(80, margin) * 0.45;
    if (margin < 10) score -= (10 - margin) * 90;

    for (const obstacle of obstacles) {
      const clearance = pointRectDistance(point, expandRect(obstacle, 12));
      if (clearance === 0) score -= 600;
      else score += Math.min(50, clearance) * 0.08;
    }
  }
  return score;
}

function tangentAlignment(point, control, outward) {
  if (!outward) return 0;
  const tangent = unitVector(control.x - point.x, control.y - point.y);
  const direction = unitVector(outward.x, outward.y);
  return tangent.x * direction.x + tangent.y * direction.y;
}

function pointBoundsMargin(point, bounds) {
  return Math.min(
    point.x - bounds.x,
    bounds.x + bounds.width - point.x,
    point.y - bounds.y,
    bounds.y + bounds.height - point.y,
  );
}

function pointRectDistance(point, rect) {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));
  return Math.hypot(dx, dy);
}

function expandRect(rect, padding) {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

function unitVector(x, y) {
  const length = Math.max(1, Math.hypot(x, y));
  return { x: x / length, y: y / length };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
