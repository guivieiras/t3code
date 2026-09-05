// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeVM from "node:vm";
import { expect, it, vi } from "vite-plus/test";

const source = NodeFS.readFileSync(new URL("../public/web-push-sw.js", import.meta.url), "utf8");

function worker() {
  const listeners = new Map<string, (event: unknown) => void>();
  const showNotification = vi.fn(async () => {});
  const focus = vi.fn(async () => {});
  const openWindow = vi.fn(async () => {});
  const clients: Array<{ url: string; focus: typeof focus }> = [];
  NodeVM.runInNewContext(source, {
    URL,
    self: {
      location: { origin: "https://t3.example.com" },
      addEventListener: (name: string, handler: (event: unknown) => void) =>
        listeners.set(name, handler),
      registration: { showNotification },
      clients: { matchAll: async () => clients, openWindow },
    },
  });
  const dispatch = async (name: string, event: Record<string, unknown>) => {
    let pending: Promise<unknown> | undefined;
    listeners.get(name)!({
      ...event,
      waitUntil: (promise: Promise<unknown>) => {
        pending = promise;
      },
    });
    await pending;
  };
  return { showNotification, focus, openWindow, clients, dispatch };
}

it("displays a push without any open page and opens its environment and thread when tapped", async () => {
  const w = worker();
  const url = "https://t3.example.com/environment-one/thread-one";
  await w.dispatch("push", {
    data: {
      json: () => ({ title: "Finished", body: "Agent turn completed.", tag: "run-one", url }),
    },
  });
  expect(w.showNotification).toHaveBeenCalledWith(
    "Finished",
    expect.objectContaining({ tag: "run-one", data: { url } }),
  );
  const close = vi.fn();
  await w.dispatch("notificationclick", { notification: { data: { url }, close } });
  expect(close).toHaveBeenCalledOnce();
  expect(w.openWindow).toHaveBeenCalledWith(url);
});

it("focuses an already open thread instead of opening it again", async () => {
  const w = worker();
  const url = "https://t3.example.com/environment-two/thread-two";
  w.clients.push({ url, focus: w.focus });
  await w.dispatch("notificationclick", { notification: { data: { url }, close: vi.fn() } });
  expect(w.focus).toHaveBeenCalledOnce();
  expect(w.openWindow).not.toHaveBeenCalled();
});

it("does not let a remote environment navigate notifications to another origin", async () => {
  const w = worker();
  const url = "https://other.example.com/thread";
  await w.dispatch("push", { data: { json: () => ({ title: "Finished", url }) } });
  await w.dispatch("notificationclick", { notification: { data: { url }, close: vi.fn() } });
  expect(w.showNotification).not.toHaveBeenCalled();
  expect(w.openWindow).not.toHaveBeenCalled();
});
