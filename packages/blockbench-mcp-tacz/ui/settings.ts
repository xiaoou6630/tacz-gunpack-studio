import { SETTING_DISCLOSE_AI_USAGE, SETTING_RISKY_EVAL_ENABLED, SETTING_SCRATCHPAD_ENABLED } from "@/lib/constants";
import { refreshToolAvailability } from "@/lib/factories";
import { onScratchpadSettingChanged } from "@/lib/scratchpad-mode";

const settings: Setting[] = [];

export function settingsSetup() {
  const category = "general";

  // Objects kept by an earlier `keepValues` teardown are superseded by the ones created below.
  // Forget them: `Setting.delete()` works by id, so deleting a stale one later would remove the new one.
  settings.length = 0;

  settings.push(
    new Setting("mcp_instructions", {
      name: tl("mcp.settings.instructions_name"),
      // https://github.com/punkpeye/fastmcp?tab=readme-ov-file#providing-instructions
      description: tl("mcp.settings.instructions_desc"),
      type: "text",
      // Sent to clients as server instructions; empty by default (see lib/instructions.ts).
      value: "",
      category,
      icon: "psychology",
    }),
    new Setting("mcp_port", {
      name: tl("mcp.settings.port_name"),
      description: tl("mcp.settings.port_desc"),
      type: "number",
      value: 3000,
      min: 1,
      max: 65535,
      category,
      icon: "numbers",
    }),
    new Setting("mcp_host", {
      name: tl("mcp.settings.host_name"),
      description: tl("mcp.settings.host_desc"),
      type: "text",
      value: "localhost",
      category,
      icon: "lan",
    }),
    new Setting("mcp_endpoint", {
      name: tl("mcp.settings.endpoint_name"),
      description: tl("mcp.settings.endpoint_desc"),
      type: "text",
      value: "/bb-mcp",
      category,
      icon: "webhook",
    }),
    new Setting("mcp_prompt_cdn_enabled", {
      name: tl("mcp.settings.prompt_cdn_name"),
      description: tl("mcp.settings.prompt_cdn_desc"),
      type: "toggle",
      value: true,
      category,
      icon: "cloud_download",
    }),
    new Setting("mcp_session_timeout", {
      name: tl("mcp.settings.session_timeout_name"),
      description: tl("mcp.settings.session_timeout_desc"),
      type: "number",
      // Upstream defaults to 30 minutes. The DeepSeek Harness MCP client has
      // no session-recovery path (no 404 handling, no reconnect), so an idle
      // disconnect leaves it permanently broken until DSH itself restarts.
      // Default to the maximum instead: an idle session costs almost nothing
      // and surviving a long pause is worth far more here.
      value: 1440,
      min: 1,
      max: 1440,
      category,
      icon: "timer",
    }),
    new Setting("mcp_sse_heartbeat", {
      name: tl("mcp.settings.sse_heartbeat_name"),
      description: tl("mcp.settings.sse_heartbeat_desc"),
      type: "number",
      value: 15,
      min: 0,
      max: 600,
      category,
      icon: "favorite",
    }),
    new Setting(SETTING_SCRATCHPAD_ENABLED, {
      name: tl("mcp.settings.scratchpad_name"),
      description: tl("mcp.settings.scratchpad_desc"),
      type: "toggle",
      value: false,
      category,
      icon: "science",
      onChange: onScratchpadSettingChanged,
    }),
    new Setting(SETTING_DISCLOSE_AI_USAGE, {
      name: tl("mcp.settings.disclose_ai_name"),
      description: tl("mcp.settings.disclose_ai_desc"),
      type: "toggle",
      value: true,
      category,
      icon: "verified_user",
    }),
    new Setting(SETTING_RISKY_EVAL_ENABLED, {
      name: tl("mcp.settings.risky_eval_name"),
      description: tl("mcp.settings.risky_eval_desc"),
      type: "toggle",
      // Off by default: arbitrary JS execution through the local MCP port is an
      // unnecessary attack surface. The TACZ tools never use risky_eval, so a
      // fresh install stays closed unless the user opts in.
      value: false,
      category,
      icon: "code",
      // Connected clients get tools/list_changed right away instead of on the next editor refresh.
      onChange: () => refreshToolAvailability(),
    })
  );

  // A `value` in the constructor is only the DEFAULT: Blockbench restores the
  // stored value on top of it, so an install that saved `true` under the
  // upstream build keeps `true` forever. Force it closed once, so upgrading
  // actually closes the hole. The user can still turn it on afterwards — the
  // marker records that we already did this, so we never fight the user.
  enforceRiskyEvalOff();

  // Same shape of problem for the session timeout: existing installs stored
  // the upstream 30-minute default, so raising the default alone would not
  // help anyone who already ran the plugin once.
  raiseSessionTimeout();
}

/**
 * One-time migration: lift `mcp_session_timeout` off the upstream 30 minutes.
 *
 * The DeepSeek Harness MCP client never recovers from a lost session (no 404
 * handling, no reconnect), so an idle disconnect leaves it broken until DSH
 * restarts. 24 hours is the setting's maximum and costs nothing while idle.
 *
 * Only touches the value when it is still at or below the old default, so a
 * user who deliberately chose something else is left alone.
 */
function raiseSessionTimeout(): void {
  if (typeof Settings === "undefined") return;
  const marker = "mcp_session_timeout_raised";
  if (Settings.get(marker) === true) return;
  const current = Number(Settings.get("mcp_session_timeout"));
  if (Number.isFinite(current) && current > 30) {
    // The user already chose something larger; record that we looked.
    writeSetting(marker, true);
    return;
  }
  // Writing `Settings.stored[id].value` only changes the SAVED value; the live
  // Setting object keeps its old `value`, and `Settings.get()` (plus the
  // Settings dialog) reads that one. On the next save the live value overwrites
  // `stored` again, so mutate the object that `settingsSetup()` created.
  const live = settings.find(setting => setting?.id === "mcp_session_timeout") as
    | { value: number }
    | undefined;
  if (live) {
    live.value = 1440;
    Settings.save?.();
    console.info("[mcp] session timeout raised to 1440 minutes; DSH cannot recover a lost MCP session on its own.");
  }
  writeSetting(marker, true);
}

/**
 * Writes one setting value in a way that works across Blockbench versions.
 *
 * Blockbench 5.2.2 removed `Settings.set`; only `get`, `save` and `stored`
 * remain, and values live in `Settings.stored[id].value`. Older builds
 * (5.0–5.1) expose `Settings.set`. Throwing here aborts the whole plugin
 * `onload`, which is exactly how this migration took the MCP server down
 * on 5.2.2, so never call a method without checking it first.
 *
 * @returns true when the value was written.
 */
function writeSetting(id: string, value: unknown): boolean {
  const settings = Settings as unknown as {
    set?: (key: string, value: unknown) => void;
    save?: () => void;
    stored?: Record<string, { value?: unknown }>;
  };
  if (typeof settings.set === "function") {
    settings.set(id, value);
    return true;
  }
  if (settings.stored) {
    const entry = settings.stored[id];
    if (entry && typeof entry === "object") {
      entry.value = value;
      settings.save?.();
      return true;
    }
  }
  return false;
}

/** One-time migration: close `risky_eval` on profiles that inherited `true`. */
function enforceRiskyEvalOff(): void {
  if (typeof Settings === "undefined") return;
  const marker = "mcp_risky_eval_migrated_off";
  if (Settings.get(marker) === true) return;
  if (Settings.get(SETTING_RISKY_EVAL_ENABLED) === true) {
    if (writeSetting(SETTING_RISKY_EVAL_ENABLED, false)) {
      console.info("[mcp] risky_eval was enabled by an older build; closed it. Re-enable it in Settings > General if you need arbitrary code execution.");
    }
  }
  // Only record the marker once the value actually stuck, otherwise a build
  // where the write silently failed would never retry the migration.
  if (Settings.get(SETTING_RISKY_EVAL_ENABLED) !== true) {
    writeSetting(marker, true);
  }
}

/** Options for {@link settingsTeardown}. */
export interface ISettingsTeardownOptions {
  /** Keep the stored values so a reload (`onunload` + `onload`) does not reset them to defaults. */
  keepValues?: boolean;
}

/**
 * Remove the plugin's settings from the Settings dialog.
 *
 * Blockbench saves settings by iterating the live `Setting` objects, so `delete()` on unload drops
 * every user-changed value (e.g. `mcp_port`) and defaults come back on the next launch. URL-installed
 * plugins are unloaded and reloaded on every start, so this hit everyone who changed the port. With
 * `keepValues` the current values are written to `Settings.stored`, which the `Setting` objects that
 * `settingsSetup()` re-creates read from, and the old objects stay registered so the next save still
 * includes them. Uninstalling deletes them for real.
 *
 * Blockbench runs `onunload` and then `onuninstall` on the same instance when uninstalling, so a
 * `keepValues` teardown must leave the objects tracked for the plain teardown that follows. A reload
 * does not accumulate stale objects because `settingsSetup()` forgets them before creating new ones.
 */
export function settingsTeardown(options: ISettingsTeardownOptions = {}) {
  // blockbench-types declares `stored` as Setting records, but at runtime it is `{ value }` per id.
  const stored = Settings.stored as Record<string, { value: unknown }>;

  settings.forEach((setting) => {
    if (options.keepValues) {
      stored[setting.id] = { value: setting.master_value };
      return;
    }
    setting.delete();
    delete stored[setting.id];
  });

  if (!options.keepValues) {
    settings.length = 0;
  }
}
