"use strict";
(() => {
  // extension-src/shared/settings.js
  var DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    showArrows: true,
    showPanel: true,
    onlyMyTurn: false,
    depth: 16,
    lines: 2,
    moveTime: 5,
    turnOverride: "auto",
    panelCollapsed: false,
    panelPosition: null
  });
  var LIMITS = Object.freeze({
    depth: Object.freeze({ min: 6, max: 24 }),
    lines: Object.freeze({ min: 1, max: 3 }),
    moveTime: Object.freeze({ min: 1, max: 20 })
  });
  var TURN_VALUES = ["auto", "white", "black"];
  function readBoolean(value, fallback) {
    return typeof value === "boolean" ? value : fallback;
  }
  function readInteger(value, limits, fallback) {
    const number = Math.round(Number(value));
    if (!Number.isFinite(number)) return fallback;
    return Math.min(limits.max, Math.max(limits.min, number));
  }
  function readPosition(value) {
    if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return null;
    return { x: value.x, y: value.y };
  }
  function sanitizeSettings(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const base = DEFAULT_SETTINGS;
    return {
      enabled: readBoolean(source.enabled, base.enabled),
      showArrows: readBoolean(source.showArrows, base.showArrows),
      showPanel: readBoolean(source.showPanel, base.showPanel),
      onlyMyTurn: readBoolean(source.onlyMyTurn, base.onlyMyTurn),
      depth: readInteger(source.depth, LIMITS.depth, base.depth),
      lines: readInteger(source.lines, LIMITS.lines, base.lines),
      moveTime: readInteger(source.moveTime, LIMITS.moveTime, base.moveTime),
      turnOverride: TURN_VALUES.includes(source.turnOverride) ? source.turnOverride : base.turnOverride,
      panelCollapsed: readBoolean(source.panelCollapsed, base.panelCollapsed),
      panelPosition: readPosition(source.panelPosition)
    };
  }
  async function loadSettings() {
    const stored = await chrome.storage.local.get(null);
    return sanitizeSettings(stored);
  }
  async function saveSettings(patch) {
    await chrome.storage.local.set(patch);
  }

  // extension-src/background.js
  var OFFSCREEN_URL = "offscreen.html";
  var creating = null;
  async function offscreenExists() {
    if (!chrome.runtime.getContexts) return false;
    const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
    return contexts.length > 0;
  }
  async function ensureOffscreen() {
    if (await offscreenExists()) return;
    if (!creating) {
      creating = chrome.offscreen.createDocument({
        url: OFFSCREEN_URL,
        reasons: ["WORKERS"],
        justification: "Runs the Stockfish engine in a dedicated worker."
      }).catch((error) => {
        if (!String(error && error.message).includes("Only a single offscreen")) throw error;
      }).finally(() => {
        creating = null;
      });
    }
    await creating;
  }
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== "ensure-engine") return false;
    ensureOffscreen().then(
      () => sendResponse({ ok: true }),
      (error) => sendResponse({ ok: false, error: String(error && error.message ? error.message : error) })
    );
    return true;
  });
  chrome.commands.onCommand.addListener(async (command) => {
    if (command !== "toggle-overlay") return;
    const settings = await loadSettings();
    await saveSettings({ enabled: !settings.enabled });
  });
})();
