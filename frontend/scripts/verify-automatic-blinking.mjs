import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compileFunction } from "node:vm";
import ts from "typescript";

const source = await readFile("src/animation/automaticBlink.ts", "utf8");
const module = { exports: {} };
compileFunction(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    ["exports"])(module.exports);
const { startAutomaticBlink } = module.exports;
let next = 0, calls = 0, random = 0;
const timers = new Map();
const clock = {
    random: () => random,
    schedule(run, delay) { const id = ++next; timers.set(id, { run, delay }); return id; },
    cancel(id) { timers.delete(id); },
};
const playback = { isBlinking: false, blinkProgress: 0, playBlink() { calls++; } };
const tick = () => { const [id, timer] = timers.entries().next().value; timers.delete(id); timer.run(); };
const stop = startAutomaticBlink(playback, clock);
assert.equal(calls, 0, "no immediate forced blink");
assert.equal(timers.values().next().value.delay, 3000);
random = 1; tick();
assert.equal(calls, 1);
assert.equal(timers.values().next().value.delay, 6000);
playback.isBlinking = true; tick(); assert.equal(calls, 1, "manual playback is not interrupted");
playback.isBlinking = false; playback.blinkProgress = .75;
tick(); assert.equal(calls, 1, "held inspection geometry is preserved");
playback.blinkProgress = 0; tick(); assert.equal(calls, 2, "automatic playback resumes");
const stale = timers.values().next().value.run;
stop(); stop(); assert.equal(timers.size, 0);
stale(); assert.equal(calls, 2); assert.equal(timers.size, 0, "late callback cannot reschedule");
const cleanup = startAutomaticBlink(playback, clock);
assert.equal(timers.size, 1, "StrictMode setup after cleanup creates one schedule");
tick(); assert.equal(calls, 3);
cleanup(); assert.equal(timers.size, 0);
console.log("PASS automatic blinking: interval bounds, repetition, manual isolation, held frames, cleanup, stale callbacks and setup replay");
