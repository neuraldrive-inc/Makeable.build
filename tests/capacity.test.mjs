import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("production capacity keeps redundant tasks and can scale to ten compiler workers", async () => {
  const serviceTemplate = await readFile(path.join(root, "infra", "aws-service.yml"), "utf8");
  assert.match(serviceTemplate, /MinTaskCount: 2/);
  assert.match(serviceTemplate, /MaxTaskCount: 10/);
  assert.match(serviceTemplate, /AutoScalingMetric: AVERAGE_CPU/);
  assert.match(serviceTemplate, /AutoScalingTargetValue: 35/);
  assert.match(serviceTemplate, /MAX_CONCURRENT_COMPILES[\s\S]*?Value: "1"/);
});

test("both browser clients back off and retry when compiler capacity is temporarily busy", async () => {
  const [sourceScript, pilotScript] = await Promise.all([
    readFile(path.join(root, "app.js"), "utf8"),
    readFile(path.join(root, "pilot", "app.js"), "utf8"),
  ]);

  for (const script of [sourceScript, pilotScript]) {
    assert.match(script, /const COMPILE_BUSY_RETRY_ATTEMPTS = 36/);
    assert.match(script, /Number\(error\?\.status\) === 429/);
    assert.match(script, /response\.headers\.get\("Retry-After"\)/);
    assert.match(script, /Math\.random\(\) \* 1200/);
    assert.match(script, /I’ll retry automatically/);
  }
});
