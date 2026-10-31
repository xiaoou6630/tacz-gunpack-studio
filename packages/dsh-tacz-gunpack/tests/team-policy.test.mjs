import test from "node:test";
import assert from "node:assert/strict";

const { blockbenchDenyFor, ROLE_TOOLS, createTeamToolPolicy, resolveContractRole } = await import("../lib/team-policy.mjs");

const names = [
  "activate_texture",
  "place_cube",
  "modify_cube",
  "capture_screenshot",
  "create_particle_effect",
  "export_model",
  "tacz_pack",
  "tacz_gun",
  "tacz_model_validate",
  "tacz_icon_render",
  "tacz_guide",
  "tacz_template_list",
  "get_project_info",
  "get_cube_uv",
  "list_outline",
  "get_undo_stack",
].map(name => ({ name: `mcp__blockbench__${name}` }));
names.push({ name: "tacz_delegate" });
names.push({ name: "tacz_build" });

test("reviewer denies mutating tools but keeps validate/icon", () => {
  const deny = blockbenchDenyFor("reviewer", names);
  assert.ok(deny.includes("mcp__blockbench__place_cube"));
  assert.ok(deny.includes("mcp__blockbench__modify_cube"));
  assert.ok(!deny.includes("mcp__blockbench__tacz_pack"));
  assert.ok(!deny.includes("mcp__blockbench__tacz_icon_render"));
});

test("researcher and learner deny every Blockbench tool", () => {
  const blockbench = names.filter(tool => tool.name.startsWith("mcp__blockbench__"));
  for (const role of ["researcher", "learner"]) {
    assert.equal(blockbenchDenyFor(role, names).length, blockbench.length);
  }
});

test("modeler keeps editing tools and drops unrelated ones", () => {
  const deny = blockbenchDenyFor("modeler", names);
  assert.ok(!deny.includes("mcp__blockbench__place_cube"));
  assert.ok(!deny.includes("mcp__blockbench__tacz_pack"));
  assert.ok(deny.includes("mcp__blockbench__create_particle_effect"));
  assert.ok(!deny.includes("mcp__blockbench__export_model"));
});

test("unknown roles are not restricted; lead only keeps inspect/package tools", () => {
  assert.deepEqual(blockbenchDenyFor("animator", names), []);
  assert.equal(ROLE_TOOLS.size, 6);
  const lead = blockbenchDenyFor("lead", names);
  assert.ok(lead.includes("mcp__blockbench__place_cube"));
  assert.ok(!lead.includes("mcp__blockbench__tacz_pack"));
});

test("engineer-named teammates resolve to the engineer contract", () => {
  assert.equal(resolveContractRole("items-core"), "engineer");
  assert.equal(resolveContractRole("dsh-items"), "engineer");
  assert.equal(resolveContractRole("engineer"), "engineer");
  assert.equal(resolveContractRole("modeler"), "modeler");
  assert.equal(resolveContractRole(""), undefined);
});

test("policy restricts a reviewer teammate on creation, even under a standard parent", () => {
  const handlers = {};
  let captured;
  let registeredGuard;
  const sections = [];
  const ctx = {
    logger: { info() {}, warn() {} },
    get(name) {
      if (name === "agentTeams") {
        return { tryMembership: () => ({ role: "teammate", name: "reviewer", root: { session: { header: { agentPreset: "standard" } } } }) };
      }
      if (name === "tools") return { schemas: () => names };
      return undefined;
    },
    on(event, handler) {
      handlers[event] = handler;
      return () => {};
    },
    effect(fn) { return fn(); },
  };
  createTeamToolPolicy(ctx, {});
  const agent = {
    id: "child-1",
    session: { header: { cwd: "E:/work" } },
    ctx: {
      get(name) {
        if (name === "systemPrompt") {
          return { section(section) { sections.push(section); return () => {}; } };
        }
        if (name === "tools") {
          return {
            guard(guard) { registeredGuard = guard; return () => {}; },
            restrict(filter) { captured = filter; return () => {}; },
          };
        }
        return undefined;
      },
    },
  };
  handlers["agent/created"]({ agent });
  assert.ok(captured);
  assert.ok(registeredGuard);
  assert.equal(sections[0]?.name, "tacz:role-contract");
  assert.match(sections[0]?.text, /reviewer/);
  assert.ok(captured.deny.includes("mcp__blockbench__place_cube"));
  assert.ok(captured.deny.includes("tacz_delegate"));
  assert.ok(captured.deny.includes("tacz_build"));
  assert.ok(!captured.deny.includes("mcp__blockbench__tacz_pack"));
});
