// Runs in the page's world so that it can read the API responses of the x.com client.
// It only learns whether hiding is enabled; the registered usernames stay in content.js.
(() => {
  const HIDDEN_ATTRIBUTE = "data-hide-japanese-x";
  // Post ID -> the language that X detected for the post's original text.
  const languages = new Map();
  let enabled = false;
  let scanScheduled = false;

  function isGraphQL(url) {
    return /^\/(i\/api\/)?graphql\//.test(new URL(url, location.href).pathname);
  }

  // Posts appear at any depth of a GraphQL response as objects with rest_id and legacy.lang.
  function collect(value) {
    if (value === null || typeof value !== "object") return;
    if (typeof value.rest_id === "string" && typeof value.legacy?.lang === "string") {
      languages.set(value.rest_id, value.legacy.lang);
    }
    for (const child of Object.values(value)) collect(child);
  }

  function receive() {
    collect(this.responseType === "json" ? this.response : JSON.parse(this.responseText));
    scheduleScan();
  }

  // The x.com client calls its API through XMLHttpRequest.
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (isGraphQL(url)) this.addEventListener("load", receive);
    return open.call(this, method, url, ...rest);
  };

  // A post's own timestamp links to its status page; a quoted post is a nested article.
  function postId(article) {
    const time = [...article.querySelectorAll('a[href*="/status/"] time')].find(
      (element) => element.closest("article") === article,
    );
    return time?.closest("a").pathname.match(/^\/\w+\/status\/(\d+)$/)?.[1] ?? null;
  }

  function scan() {
    scanScheduled = false;
    const hidden = new Set();
    if (enabled) {
      for (const article of document.querySelectorAll("article")) {
        if (article.parentElement.closest("article") !== null) continue;
        const id = postId(article);
        if (id !== null && languages.get(id) === "ja") {
          hidden.add(article.closest('[data-testid="cellInnerDiv"]') ?? article);
        }
      }
    }
    for (const element of document.querySelectorAll(`[${HIDDEN_ATTRIBUTE}]`)) {
      if (!hidden.has(element)) element.removeAttribute(HIDDEN_ATTRIBUTE);
    }
    for (const element of hidden) element.setAttribute(HIDDEN_ATTRIBUTE, "");
  }

  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(scan);
  }

  document.addEventListener("hide-japanese-x:state", (event) => {
    ({ enabled } = JSON.parse(event.detail));
    scheduleScan();
  });
  new MutationObserver(scheduleScan).observe(document, { childList: true, subtree: true });
  document.dispatchEvent(new CustomEvent("hide-japanese-x:request"));
})();
