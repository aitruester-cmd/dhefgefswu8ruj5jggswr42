"use strict";
(() => {
  // extension-src/shared/uci.js
  function parseInfoLine(line) {
    const tokens = line.trim().split(/\s+/);
    if (tokens[0] !== "info" || tokens[1] === "string") return null;
    let depth = null;
    let multipv = 1;
    let score = null;
    let bounded = false;
    let pv = [];
    for (let index = 1; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (token === "depth") {
        depth = Number(tokens[index + 1]);
        index += 1;
      } else if (token === "multipv") {
        multipv = Number(tokens[index + 1]);
        index += 1;
      } else if (token === "score") {
        const unit = tokens[index + 1];
        const value = Number(tokens[index + 2]);
        if ((unit === "cp" || unit === "mate") && Number.isFinite(value)) score = { unit, value };
        const flag = tokens[index + 3];
        if (flag === "lowerbound" || flag === "upperbound") bounded = true;
        index += 2;
      } else if (token === "pv") {
        pv = tokens.slice(index + 1);
        break;
      }
    }
    if (!score || bounded || pv.length === 0) return null;
    if (!Number.isInteger(depth) || depth < 1) return null;
    if (!Number.isInteger(multipv) || multipv < 1) return null;
    return { depth, multipv, score, pv };
  }
  function parseBestMove(line) {
    const match = /^bestmove\s+(\S+)/.exec(line);
    if (!match) return void 0;
    return match[1] === "(none)" || match[1] === "0000" ? null : match[1];
  }

  // extension-src/offscreen.js
  var ENGINE_URL = "engine/stockfish-19-lite-single.js";
  var BOOT_TIMEOUT_MS = 2e4;
  var FEN_PATTERN = /^[pnbrqkPNBRQK1-8/]+ [wb] (-|[KQkq]{1,4}) (-|[a-h][36]) \d+ \d+$/;
  var state = {
    worker: null,
    stage: "booting",
    current: null,
    pending: null
  };
  var ports = /* @__PURE__ */ new Set();
  function send(command) {
    state.worker.postMessage(command);
  }
  function post(port, message) {
    try {
      port.postMessage(message);
    } catch {
      ports.delete(port);
    }
  }
  function broadcastError(message) {
    for (const port of ports) post(port, { type: "error", message });
  }
  function fail(message) {
    state.stage = "failed";
    state.current = null;
    state.pending = null;
    broadcastError(message);
  }
  function pump() {
    if (state.stage !== "idle") return;
    while (state.pending) {
      const job = state.pending;
      state.pending = null;
      if (!ports.has(job.port)) continue;
      state.current = job;
      state.stage = "searching";
      send(`setoption name MultiPV value ${job.multipv}`);
      send(`position fen ${job.fen}`);
      send(`go depth ${job.depth} movetime ${job.moveTime}`);
      return;
    }
  }
  function enqueue(job) {
    if (state.stage === "failed") {
      post(job.port, { type: "error", message: "The engine is not running." });
      return;
    }
    state.pending = job;
    if (state.stage === "searching") {
      if (state.current) state.current.cancelled = true;
      send("stop");
    } else {
      pump();
    }
  }
  function handleBestMove(best) {
    const job = state.current;
    state.current = null;
    state.stage = "idle";
    if (job && !job.cancelled) post(job.port, { type: "done", id: job.id, best });
    pump();
  }
  function handleLine(line) {
    if (line === "uciok") {
      send("isready");
      return;
    }
    if (line === "readyok") {
      if (state.stage === "booting") {
        state.stage = "idle";
        pump();
      }
      return;
    }
    if (line.startsWith("info")) {
      const job = state.current;
      if (!job || job.cancelled) return;
      const info = parseInfoLine(line);
      if (info) post(job.port, { type: "info", id: job.id, ...info });
      return;
    }
    const best = parseBestMove(line);
    if (best !== void 0) handleBestMove(best);
  }
  function startEngine() {
    const worker = new Worker(ENGINE_URL);
    state.worker = worker;
    worker.onmessage = (event) => handleLine(String(event.data).trim());
    worker.onerror = (event) => fail(event.message || "The engine worker crashed.");
    send("uci");
    setTimeout(() => {
      if (state.stage === "booting") fail("The engine did not start in time.");
    }, BOOT_TIMEOUT_MS);
  }
  function readInteger(value, min, max) {
    const number = Math.round(Number(value));
    if (!Number.isFinite(number)) return null;
    return Math.min(max, Math.max(min, number));
  }
  function parseRequest(port, message) {
    if (typeof message.fen !== "string" || !FEN_PATTERN.test(message.fen)) return null;
    const id = readInteger(message.id, 0, Number.MAX_SAFE_INTEGER);
    const depth = readInteger(message.depth, 1, 30);
    const multipv = readInteger(message.multipv, 1, 5);
    const moveSeconds = readInteger(message.moveTime, 1, 60);
    if (id === null || depth === null || multipv === null || moveSeconds === null) return null;
    return { port, id, fen: message.fen, depth, multipv, moveTime: moveSeconds * 1e3, cancelled: false };
  }
  function stopFor(port) {
    if (state.pending && state.pending.port === port) state.pending = null;
    if (state.current && state.current.port === port) {
      state.current.cancelled = true;
      if (state.stage === "searching") send("stop");
    }
  }
  function handlePortMessage(port, message) {
    if (!message || typeof message !== "object") return;
    if (message.type === "analyze") {
      const job = parseRequest(port, message);
      if (job) enqueue(job);
      else post(port, { type: "error", message: "The analysis request was rejected." });
    } else if (message.type === "stop") {
      stopFor(port);
    }
  }
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "analysis") return;
    ports.add(port);
    port.onMessage.addListener((message) => handlePortMessage(port, message));
    port.onDisconnect.addListener(() => {
      stopFor(port);
      ports.delete(port);
    });
  });
  startEngine();
})();
