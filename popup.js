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
  function subscribeSettings(listener) {
    const handler = (changes, area) => {
      if (area === "local") loadSettings().then(listener);
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }

  // extension-src/popup.js
  var controls = [...document.querySelectorAll("[data-key]")];
  function showValue(control) {
    const output = document.getElementById(`${control.dataset.key}-value`);
    if (output) output.textContent = control.value;
  }
  function paint(settings) {
    for (const control of controls) {
      const value = settings[control.dataset.key];
      if (control.type === "checkbox") {
        control.checked = Boolean(value);
      } else {
        control.value = String(value);
        showValue(control);
      }
    }
  }
  for (const control of controls) {
    if (control.type === "range") {
      const limits = LIMITS[control.dataset.key];
      control.min = String(limits.min);
      control.max = String(limits.max);
      control.step = "1";
    }
    control.addEventListener("input", () => {
      const value = control.type === "checkbox" ? control.checked : Number(control.value);
      showValue(control);
      saveSettings({ [control.dataset.key]: value });
    });
  }
  loadSettings().then(paint);
  subscribeSettings(paint);
})();
