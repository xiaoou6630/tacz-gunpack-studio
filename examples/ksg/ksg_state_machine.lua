-- Kel-Tec KSG state machine.
-- Inherits the stock manual-action state machine (pump/bolt cycle + shell
-- ejection timing) and adds an m870-style shell-by-shell reload state so the
-- pump shotgun loads one shell per loop instead of a magazine swap.
--
-- Display must point at:
--   "animation": "keltec:ksg"
--   "state_machine": "keltec:ksg_state_machine"
--   "state_machine_param": { bolt_shell_ejecting_time, intro_shell_ejecting_time }
--
-- Clip names resolved by this state machine (all present in ksg.animation.json):
--   static_idle, static_bolt_caught, draw, put_away, shoot, bolt,
--   reload_intro_empty, reload_intro, reload_loop, reload_end,
--   inspect, inspect_empty
--
-- Reload timing (intro/loop/ending) lives in ksg_data.json script_param and is
-- consumed by keltec:ksg_gun_logic, exactly like the official m870 pair.
local default = require("tacz_manual_action_state_machine")
local STATIC_TRACK_LINE = default.STATIC_TRACK_LINE
local MAIN_TRACK = default.MAIN_TRACK
local main_track_states = default.main_track_states

local idle_state = setmetatable({}, { __index = main_track_states.idle })
-- reload_state drives the per-shell reload: intro plays once, then "loop"
-- repeats once per shell, then "end" closes it out.
local reload_state = {
    need_ammo = 0,
    loaded_ammo = 0,
}

local function get_ejection_time(context)
    local ejection_time = context:getStateMachineParams().intro_shell_ejecting_time
    if (ejection_time) then
        ejection_time = ejection_time * 1000
    else
        ejection_time = 0
    end
    return ejection_time
end

local function runInspectAnimation(context)
    local track = context:getTrack(STATIC_TRACK_LINE, MAIN_TRACK)
    if ((not context:hasBulletInBarrel()) and (context:getAmmoCount() <= 0)) then
        context:runAnimation("inspect_empty", track, false, PLAY_ONCE_STOP, 0.2)
    else
        context:runAnimation("inspect", track, false, PLAY_ONCE_STOP, 0.2)
    end
end

-- Redirect reload into the new shell-by-shell reload_state; keep inspect
-- behaviour on the KSG clips.
function idle_state.transition(this, context, input)
    if (input == INPUT_RELOAD) then
        return this.main_track_states.reload
    end
    if (input == INPUT_INSPECT) then
        runInspectAnimation(context)
        return this.main_track_states.inspect
    end
    return main_track_states.idle.transition(this, context, input)
end

-- Pick the empty or tactical intro clip and record how many shells are needed.
function reload_state.entry(this, context)
    local state = this.main_track_states.reload
    local isNoAmmo = not context:hasBulletInBarrel()
    if (isNoAmmo) then
        -- timestamp drives the shell ejection inside reload_intro_empty
        state.timestamp = context:getCurrentTimestamp()
        state.ejection_time = get_ejection_time(context)
        context:runAnimation("reload_intro_empty", context:getTrack(STATIC_TRACK_LINE, MAIN_TRACK), false, PLAY_ONCE_HOLD, 0.2)
    else
        state.timestamp = -1
        state.ejection_time = 0
        context:runAnimation("reload_intro", context:getTrack(STATIC_TRACK_LINE, MAIN_TRACK), false, PLAY_ONCE_HOLD, 0.2)
    end
    state.need_ammo = context:getMaxAmmoCount() - context:getAmmoCount()
    state.loaded_ammo = 0
end

-- One reload_loop clip per shell; finish once we have enough or run dry.
function reload_state.update(this, context)
    local state = this.main_track_states.reload
    if (state.timestamp ~= -1 and context:getCurrentTimestamp() - state.timestamp > state.ejection_time) then
        context:popShellFrom(0)
        state.timestamp = -1
    end
    if (state.loaded_ammo > state.need_ammo or not context:hasAmmoToConsume()) then
        context:trigger(this.INPUT_RELOAD_RETREAT)
    else
        local track = context:getTrack(STATIC_TRACK_LINE, MAIN_TRACK)
        if (context:isHolding(track)) then
            context:runAnimation("reload_loop", track, false, PLAY_ONCE_HOLD, 0)
            state.loaded_ammo = state.loaded_ammo + 1
        end
    end
end

-- Close the reload with reload_end, then fall back to idle.
function reload_state.transition(this, context, input)
    if (input == this.INPUT_RELOAD_RETREAT or input == INPUT_CANCEL_RELOAD) then
        context:runAnimation("reload_end", context:getTrack(STATIC_TRACK_LINE, MAIN_TRACK), false, PLAY_ONCE_STOP, 0.2)
        return this.main_track_states.idle
    end
    return this.main_track_states.idle.transition(this, context, input)
end

local M = setmetatable({
    main_track_states = setmetatable({
        idle = idle_state,
        reload = reload_state,
    }, { __index = main_track_states }),
    INPUT_RELOAD_RETREAT = "reload_retreat",
}, { __index = default })

function M:initialize(context)
    default.initialize(self, context)
    self.main_track_states.reload.need_ammo = 0
    self.main_track_states.reload.loaded_ammo = 0
end

return M
