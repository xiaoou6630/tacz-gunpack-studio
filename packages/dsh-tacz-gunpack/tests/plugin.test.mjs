import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const home = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-tacz-test-"));
process.env.DSH_HOME = home;

const { seedSkills, readSkill, listSkills, writeSkill, rollbackSkill, learnLesson, validateSkill } = await import("../lib/skills.mjs");
const { expandToolAllowList, roleRoster, buildRolePersona, ROLES } = await import("../lib/roles.mjs");
const { mcpRowYaml, installMcpRow } = await import("../lib/mcp-install.mjs");
const { parseFrontmatter } = await import("../lib/paths.mjs");

test.after(() => fs.rmSync(home, { recursive: true, force: true }));

test("seeds six role skills", () => {
  const seeded = seedSkills();
  // Fresh DSH_HOME: every role is copied. `updated`/`kept` cover the re-seed path.
  assert.equal(seeded.copied.length + seeded.updated.length, 6);
  const skills = listSkills();
  assert.equal(skills.length, 6);
  for (const role of Object.keys(ROLES)) {
    const parsed = readSkill(role);
    assert.ok(parsed.data.name, `${role} has name`);
    assert.ok(parsed.body.length > 100, `${role} has body`);
  }
});

test("re-seeding refreshes a stale skill and archives the outgoing file", () => {
  const seeded = seedSkills();
  assert.equal(seeded.kept.length + seeded.copied.length + seeded.updated.length, 6);
  // Simulate a stale on-disk skill (an older plugin build, or a local edit).
  const role = "modeler";
  const liveFile = path.join(seeded.root, role, "SKILL.md");
  fs.writeFileSync(liveFile, "---\nname: stale\ndescription: old\nwhenToUse: x\n---\n\n# Old body\n", "utf8");
  const second = seedSkills();
  assert.ok(second.updated.includes(role), "stale skill must be refreshed");
  const versions = path.join(seeded.root, role, "versions");
  assert.ok(fs.readdirSync(versions).some(name => name.endsWith(".md")), "outgoing file must be archived");
  const restored = readSkill(role);
  assert.ok(restored.body.includes("TACZ Modeler"), "refreshed body comes from the package seed");
});

test("frontmatter parser handles folded descriptions", () => {
  const parsed = parseFrontmatter("---\nname: demo\ndescription: one\n  two\nwhenToUse: now\n---\n\n# Body");
  assert.equal(parsed.data.name, "demo");
  assert.match(parsed.data.description, /one two/);
  assert.equal(parsed.body, "# Body");
});

test("skill writes are versioned and rollback restores", () => {
  const role = "modeler";
  const before = readSkill(role).text;
  const updated = `${before.trimEnd()}\n\n## Test rule\n\nAlways check the muzzle at -Z.\n`;
  writeSkill(role, updated, "test");
  assert.match(readSkill(role).text, /Test rule/);
  const versions = fs.readdirSync(path.join(home, "tacz-gunpack", "skills", role, "versions"));
  assert.ok(versions.length >= 1);
  rollbackSkill(role);
  assert.equal(readSkill(role).text, before);
});

test("lesson appends and applies", () => {
  const result = learnLesson("reviewer", "A 1px gap is a major finding.", true);
  assert.equal(result.applied, true);
  assert.match(readSkill("reviewer").text, /1px gap/);
});

test("invalid skill is rejected", () => {
  assert.throws(() => validateSkill("# no frontmatter", "modeler"), /frontmatter/);
  assert.throws(() => validateSkill("---\nname: x\ndescription: y\n---\ntext\napi_key: sk-12345678901234567890", "modeler"), /credential/);
});

test("role personas and tool expansion", () => {
  assert.equal(roleRoster().length, 5);
  const persona = buildRolePersona("reviewer", "BODY");
  assert.match(persona, /Reviewer/);
  assert.match(persona, /status/);
  const names = [
    { name: "mcp__blockbench__tacz_pack" },
    { name: "mcp__blockbench__tacz_gun" },
    { name: "mcp__blockbench__capture_screenshot" },
    { name: "read" },
    { name: "write" },
  ];
  const allow = expandToolAllowList(names, ROLES.reviewer.patterns);
  assert.ok(allow.includes("mcp__blockbench__tacz_pack"));
  assert.ok(!allow.includes("write"));
});

test("mcp install is idempotent and backs up", () => {
  const profile = path.join(home, "profiles", "desktop");
  fs.mkdirSync(profile, { recursive: true });
  const patch = path.join(profile, "cordis.patch.yml");
  fs.writeFileSync(patch, "# existing\n", "utf8");
  assert.match(mcpRowYaml(), /mcp-blockbench/);
  const first = installMcpRow({ profileDir: profile });
  assert.equal(first.already, false);
  assert.ok(fs.existsSync(first.backup));
  const second = installMcpRow({ profileDir: profile });
  assert.equal(second.already, true);
  assert.match(fs.readFileSync(patch, "utf8"), /mcp-blockbench/);
});
