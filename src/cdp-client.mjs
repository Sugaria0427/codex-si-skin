import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export const defaultStateRoot = process.env.CODEX_SKIN_HOME || path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "codex-si-skin");

export class CdpSession {
  constructor(url) { this.url = url; this.pending = new Map(); this.listeners = new Map(); this.nextId = 0; }
  async open(timeout = 5000) {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.ws.close(); reject(new Error("CDP connection timeout")); }, timeout);
      this.ws.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      this.ws.addEventListener("error", () => { clearTimeout(timer); reject(new Error("CDP connection failed")); }, { once: true });
    });
    this.ws.addEventListener("message", event => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.id) {
        const entry = this.pending.get(message.id);
        if (!entry) return;
        clearTimeout(entry.timer); this.pending.delete(message.id);
        if (message.error) entry.reject(new Error(message.error.message)); else entry.resolve(message.result);
      } else for (const callback of this.listeners.get(message.method) || []) callback(message.params || {});
    });
    this.ws.addEventListener("close", () => {
      for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(new Error("CDP closed")); }
      this.pending.clear();
    });
    return this;
  }
  on(method, callback) { const entries = this.listeners.get(method) || []; entries.push(callback); this.listeners.set(method, entries); }
  send(method, params = {}, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.ws.send(JSON.stringify({ id, method, params })); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  async evaluate(expression, timeout = 30000) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, timeout);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  }
  close() { this.ws?.close(); }
}

export function isSkinPage(target) {
  if (target.type !== "page" || !/^app:\/\/(?:-|codex)(?:\/|$)/.test(target.url)) return false;
  const url = new URL(target.url), route = url.searchParams.get("initialRoute") || url.pathname;
  return !/^\/avatar-overlay(?:[/?#]|$)/.test(route);
}

export async function managedTargets(stateRoot = defaultStateRoot) {
  const state = JSON.parse(await fs.readFile(path.join(stateRoot, "state.json"), "utf8"));
  if (!Number.isInteger(state.port) || state.port < 1024 || state.port > 65535 || !/^[A-Za-z0-9-]+$/.test(state.browserId)) throw new Error("Invalid managed CDP identity");
  const get = async route => {
    const response = await fetch(`http://127.0.0.1:${state.port}${route}`, { redirect: "error", signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("Managed CDP endpoint unavailable");
    return response.json();
  };
  const version = await get("/json/version");
  const browser = new URL(version.webSocketDebuggerUrl);
  if (browser.protocol !== "ws:" || !["127.0.0.1", "localhost"].includes(browser.hostname) || Number(browser.port) !== state.port || browser.pathname !== `/devtools/browser/${state.browserId}`) throw new Error("Managed CDP identity changed");
  const targets = (await get("/json/list")).filter(target => {
    if (!isSkinPage(target)) return false;
    const endpoint = new URL(target.webSocketDebuggerUrl);
    return endpoint.protocol === "ws:" && ["127.0.0.1", "localhost"].includes(endpoint.hostname) && Number(endpoint.port) === state.port && endpoint.pathname === `/devtools/page/${target.id}` && !endpoint.search && !endpoint.hash;
  });
  return { state, targets };
}
