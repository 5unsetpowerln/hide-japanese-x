// Decides whether hiding is enabled by matching the signed-in account, which page.js
// reads from the page, against the registered usernames.
(() => {
  let usernames = new Set();
  let viewerId = null;
  let viewer = null;
  let ready = false;

  function sendState() {
    if (!ready) return;
    const enabled = viewer !== null && usernames.has(viewer.toLowerCase());
    document.dispatchEvent(
      new CustomEvent("hide-japanese-x:state", { detail: JSON.stringify({ viewerId, enabled }) }),
    );
  }

  document.addEventListener("hide-japanese-x:request", sendState);
  document.addEventListener("hide-japanese-x:viewer", (event) => {
    viewer = event.detail;
    browser.storage.local.set({ lastViewer: viewer });
    sendState();
  });
  browser.runtime.onMessage.addListener((message) => {
    if (message.type !== "viewer-id-changed") return;
    viewerId = message.id;
    viewer = null;
    sendState();
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.usernames) return;
    usernames = new Set(changes.usernames.newValue ?? []);
    sendState();
  });

  Promise.all([
    browser.storage.local.get("usernames"),
    browser.runtime.sendMessage({ type: "viewer-id" }),
  ]).then(([stored, id]) => {
    usernames = new Set(stored.usernames ?? []);
    viewerId = id;
    ready = true;
    sendState();
  });
})();
