// Runs in the page's world so that it can read the Relay store of the x.com client.
// It only learns the signed-in account and whether hiding is enabled; the registered
// usernames stay in the isolated content script.
(() => {
  const HIDDEN_ATTRIBUTE = "data-hide-japanese-x";
  const environments = [];
  let viewerId = null;
  let reportedViewer = null;
  let enabled = false;
  let scanScheduled = false;

  // relay-runtime registers every environment it creates with this hook when it exists.
  window.__RELAY_DEVTOOLS_HOOK__ = {
    registerEnvironment(environment) {
      environments.push(environment);
      scheduleScan();
    },
  };

  // Relay stores entities under base64("<typename>:<rest_id>").
  function linkedRecord(typename, restId, field) {
    const id = btoa(`${typename}:${restId}`);
    for (const environment of environments) {
      const source = environment.getStore().getSource();
      const ref = source.get(id)?.[field]?.__ref;
      if (ref) return source.get(ref);
    }
    return undefined;
  }

  function originalLanguage(postId) {
    return linkedRecord("Tweet", postId, "legacy")?.lang;
  }

  function viewerScreenName() {
    return linkedRecord("User", viewerId, "core")?.screen_name;
  }

  function postId(article) {
    for (const link of article.querySelectorAll('a[href*="/status/"]')) {
      if (link.closest("article") !== article) continue;
      const match = link.pathname.match(/^\/\w+\/status\/(\d+)$/);
      if (match) return match[1];
    }
    return null;
  }

  function isTopLevel(article) {
    return article.parentElement.closest("article") === null;
  }

  // A timeline cell is hidden as a whole only when every post in it is hidden,
  // so that a cell holding several posts does not lose the ones to keep.
  function hiddenElements() {
    const hiddenPosts = new Set();
    for (const article of document.querySelectorAll("article")) {
      const id = postId(article);
      if (id !== null && originalLanguage(id) === "ja") hiddenPosts.add(article);
    }
    const elements = new Set();
    for (const article of hiddenPosts) {
      const cell = isTopLevel(article) ? article.closest("li") : null;
      const cellPosts = cell ? [...cell.querySelectorAll("article")].filter(isTopLevel) : [];
      elements.add(cell && cellPosts.every((post) => hiddenPosts.has(post)) ? cell : article);
    }
    return elements;
  }

  function scan() {
    scanScheduled = false;
    if (viewerId !== null) {
      const viewer = viewerScreenName();
      if (viewer !== undefined && viewer !== reportedViewer) {
        reportedViewer = viewer;
        document.dispatchEvent(new CustomEvent("hide-japanese-x:viewer", { detail: viewer }));
      }
    }
    const elements = enabled ? hiddenElements() : new Set();
    for (const element of document.querySelectorAll(`[${HIDDEN_ATTRIBUTE}]`)) {
      if (!elements.has(element)) element.removeAttribute(HIDDEN_ATTRIBUTE);
    }
    for (const element of elements) element.setAttribute(HIDDEN_ATTRIBUTE, "");
  }

  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(scan);
  }

  document.addEventListener("hide-japanese-x:state", (event) => {
    const state = JSON.parse(event.detail);
    if (state.viewerId !== viewerId) reportedViewer = null;
    ({ viewerId, enabled } = state);
    scheduleScan();
  });
  new MutationObserver(scheduleScan).observe(document, { childList: true, subtree: true });
  document.dispatchEvent(new CustomEvent("hide-japanese-x:request"));
})();
