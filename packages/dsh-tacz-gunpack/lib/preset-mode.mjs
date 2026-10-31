/**
 * Registers the「TACZ 枪包工坊」agent preset from the same bundle that owns the
 * tools and skills. The mode used to live in a separate `dsh-tacz-mode` bundle;
 * keeping it here makes the studio one installable plugin and removes the
 * cross-package definition import.
 *
 * @module
 */
import { TACZ_PRESET } from "../preset/definition.mjs";

/**
 * Registers the preset when the AgentPresets service exists on `ctx`.
 *
 * @param {object} ctx plugin or injected scope context.
 * @returns {boolean} whether registration was attempted.
 */
export function registerTaczMode(ctx) {
  const agentPresets = ctx.get("agentPresets");
  if (!agentPresets || typeof agentPresets.register !== "function") return false;

  let unregister;
  void (async () => {
    try {
      const existing = await agentPresets.list();
      if (existing.some(preset => preset.id === TACZ_PRESET.id)) {
        ctx.logger?.info?.(`[dsh-tacz-gunpack] mode "${TACZ_PRESET.id}" already registered`);
        return;
      }
      unregister = await agentPresets.register(TACZ_PRESET);
      ctx.logger?.info?.(`[dsh-tacz-gunpack] registered mode "${TACZ_PRESET.id}" (${TACZ_PRESET.name})`);
    } catch (error) {
      ctx.logger?.warn?.(`[dsh-tacz-gunpack] failed to register mode "${TACZ_PRESET.id}": ${error instanceof Error ? error.message : String(error)}`);
    }
  })();

  ctx.effect(() => () => {
    if (unregister) Promise.resolve(unregister()).catch(() => undefined);
  });
  return true;
}

/**
 * Waits for the optional `agentPresets` service before registering the mode.
 * Works with the real Cordis `inject` and with simpler test contexts.
 *
 * @param {object} ctx plugin context.
 */
export function installTaczMode(ctx) {
  if (typeof ctx.inject === "function") {
    ctx.inject(["agentPresets"], scope => {
      registerTaczMode(scope);
    });
    return;
  }
  registerTaczMode(ctx);
}
