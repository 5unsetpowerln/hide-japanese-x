// Decides whether hiding is enabled by matching the signed-in account against the registered
// usernames, and tells page.js only the result.
(() => {
  let usernames = null;
  let viewer = null;
  let sentEnabled = null;
  let updateScheduled = false;

  // The navigation's profile link points to the signed-in account's profile.
  function currentViewer() {
    return document.querySelector('a[data-testid="AppTabBar_Profile_Link"]')?.pathname.slice(1) ?? null;
  }

  function update() {
    updateScheduled = false;
    const current = currentViewer();
    if (current !== viewer) {
      viewer = current;
      if (viewer !== null) browser.storage.local.set({ lastViewer: viewer });
    }
    if (usernames === null) return;
    const enabled = viewer !== null && usernames.has(viewer.toLowerCase());
    if (enabled === sentEnabled) return;
    sentEnabled = enabled;
    document.dispatchEvent(new CustomEvent("hide-japanese-x:state", { detail: JSON.stringify({ enabled }) }));
  }

  function scheduleUpdate() {
    if (updateScheduled) return;
    updateScheduled = true;
    requestAnimationFrame(update);
  }

  document.addEventListener("hide-japanese-x:request", () => {
    sentEnabled = null;
    scheduleUpdate();
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.usernames) return;
    usernames = new Set(changes.usernames.newValue ?? []);
    scheduleUpdate();
  });
  new MutationObserver(scheduleUpdate).observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["href"],
  });
  browser.storage.local.get("usernames").then((stored) => {
    usernames = new Set(stored.usernames ?? []);
    scheduleUpdate();
  });
})();
