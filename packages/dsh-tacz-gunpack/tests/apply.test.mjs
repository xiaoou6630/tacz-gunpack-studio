import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const home = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-tacz-apply-"));
process.env.DSH_HOME = home;

const { apply } = await import("../index.mjs");

function makeCtx() {
  const registeredTools = [];
  const registeredCommands = [];
  const providers = [];
  const registeredPresets = [];
  const ctx = {
    logger: { info() {}, warn() {} },
    get(name) {
      if (name === "agentPresets") return {
        async list() { return registeredPresets.map(preset => ({ id: preset.id })); },
        async register(definition) { registeredPresets.push(definition); return async () => {}; },
      };
      if (name === "tools") return {
        register(definition) { registeredTools.push(definition); return () => {}; },
        schemas() { return registeredTools.map(tool => ({ name: tool.name })); },
      };
      if (name === "commands") return {
        register(definition) { registeredCommands.push(definition); return () => {}; },
      };
      if (name === "skills") return {
        registerProvider(factory) { providers.push(factory({ invalidate() {} })); return () => {}; },
      };
      if (name === "subagents") return {
        list() { return ["spawn"]; },
        async startActivation(spec) {
          return {
            childId: "child-1",
            result: Promise.resolve({
              output: [{ type: "text", text: "{\"status\":\"ok\",\"summary\":\"done\",\"artifacts\":[],\"findings\":[],\"next\":[]}" }],
              structured: { status: "ok", summary: "done", artifacts: [], findings: [], next: [] },
              stopReason: "completed",
            }),
            async dispose() {},
            spec,
          };
        },
      };
      if (name === "llm") return { stream: async function* () {} };
      if (name === "web") return { async search({ query }) { return { query, results: [{ title: "ref", url: "https://example.com" }] }; } };
      return undefined;
    },
    effect(fn) { return fn(); },
    on() { return () => {}; },
    inject(_names, fn) { fn(ctx); },
  };
  return { ctx, registeredTools, registeredCommands, providers, registeredPresets };
}

test("apply registers six tools, one command, and a skill provider", async () => {
  const { ctx, registeredTools, registeredCommands, providers } = makeCtx();
  apply(ctx, {});
  const names = registeredTools.map(tool => tool.name);
  assert.deepEqual(names, ["tacz_status", "tacz_delegate", "tacz_reference", "tacz_spec", "tacz_build", "tacz_verify", "tacz_skill", "tacz_install_mcp", "tacz_install_preset", "tacz_item"]);
  assert.equal(registeredCommands.length, 1);
  assert.equal(registeredCommands[0].name, "tacz");
  assert.equal(providers.length, 1);
  const catalog = await providers[0].list();
  assert.equal(catalog.candidates.length, 6);
  const modeler = catalog.candidates.find(candidate => candidate.name === "tacz-modeler");
  assert.ok(modeler);
  const full = await providers[0].get(modeler);
  assert.match(full.content, /TACZ Modeler/);
});

test("registers the TACZ mode from the same bundle", async () => {
  const { ctx, registeredPresets } = makeCtx();
  apply(ctx, {});
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(registeredPresets.length, 1);
  assert.equal(registeredPresets[0].id, "tacz-gunpack");
  assert.ok(Array.isArray(registeredPresets[0].plugins));
});

test("status reports the tool catalog and skills", async () => {
  const { ctx, registeredTools } = makeCtx();
  apply(ctx, {});
  const status = await registeredTools.find(tool => tool.name === "tacz_status").execute({}, {});
  assert.equal(status.ok, true);
  assert.equal(status.skills.length, 6);
  assert.equal(status.roles.length, 5);
});

test("skill learn applies a lesson", async () => {
  const { ctx, registeredTools } = makeCtx();
  apply(ctx, {});
  const tool = registeredTools.find(item => item.name === "tacz_skill");
  const result = await tool.execute({ action: "learn", role: "modeler", text: "Check the muzzle at -Z.", source: "vendor/TACZ", apply: true }, {});
  assert.equal(result.applied, true);
  const read = await tool.execute({ action: "read", role: "modeler" }, {});
  assert.match(read.content, /muzzle at -Z/);
  const lessons = await tool.execute({ action: "lessons", role: "modeler" }, {});
  assert.match(lessons.content, /Source: vendor\/TACZ/);
  assert.match(lessons.content, /muzzle at -Z/);

  const lessonOnly = await tool.execute({ action: "learn", role: "modeler", text: "Only LESSONS.md should change." }, {});
  assert.equal(lessonOnly.applied, false);
  const readAfter = await tool.execute({ action: "read", role: "modeler" }, {});
  assert.doesNotMatch(readAfter.content, /Only LESSONS\.md should change/);
});

test("reference search uses the web service", async () => {
  const { ctx, registeredTools } = makeCtx();
  apply(ctx, {});
  const tool = registeredTools.find(item => item.name === "tacz_reference");
  const result = await tool.execute({ action: "search", query: "AK-47 side view" }, {});
  assert.equal(result.query, "AK-47 side view");
  assert.equal(result.results.results[0].title, "ref");
});

test("delegate starts a caller-delivery activation", async () => {
  const { ctx, registeredTools } = makeCtx();
  apply(ctx, {});
  const tool = registeredTools.find(item => item.name === "tacz_delegate");
  const result = await tool.execute(
    { role: "learner", task: "self check" },
    { agent: { id: "parent-1" }, signal: new AbortController().signal },
  );
  assert.equal(result.provider, "spawn");
  assert.equal(result.child_session_id, "child-1");
  assert.equal(result.structured.status, "ok");
  assert.equal(result.stop_reason, "completed");
});
