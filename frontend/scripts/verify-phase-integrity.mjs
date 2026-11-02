import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

// Historical geometry/blink baselines remain immutable. Only the five explicitly
// migrated renderer/coordinator files may match a separately recorded new hash.
// Both the old baseline and new integration hash must match the recorded pair.
const migrations = JSON.parse(await readFile("reports/production-geometry/integrity-migration.json", "utf8"));
assert.deepEqual(Object.keys(migrations).sort(), [
    "src/components/face/Eyes.tsx", "src/components/face/FaceRenderer.tsx",
    "src/animation/expressionTransition.ts", "src/animation/transitionStrategy.ts", "src/animation/useExpressionTransition.ts",
].sort(), "only the explicitly integrated files have migration hashes");
export async function assertPhaseIntegrity(file, expected) {
    const current = createHash("sha256").update(await readFile(file)).digest("hex");
    if (current === expected) return;
    const migration = migrations[file];
    assert.ok(migration, file + " has no authorized Phase 1 integration migration");
    assert.equal(migration.previous, expected, file + " historical baseline preserved");
    assert.equal(current, migration.integrated, file + " integrated implementation integrity");
}
