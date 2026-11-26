browser.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") browser.runtime.openOptionsPage();
});

// x.com keeps the signed-in account's user ID in the twid cookie as "u=<id>" (URL-encoded).
async function viewerId(storeId) {
  const cookie = await browser.cookies.get({ url: "https://x.com/", name: "twid", storeId });
  return cookie ? (decodeURIComponent(cookie.value).match(/u=(\d+)/)?.[1] ?? null) : null;
}

browser.runtime.onMessage.addListener((message, sender) => {
  if (message.type !== "viewer-id") return undefined;
  return viewerId(sender.tab.cookieStoreId);
});

// x.com can switch or sign out the account without reloading the page.
browser.cookies.onChanged.addListener(async ({ cookie }) => {
  if (cookie.name !== "twid" || cookie.domain.replace(/^\./, "") !== "x.com") return;
  const id = await viewerId(cookie.storeId);
  const tabs = await browser.tabs.query({ url: "https://x.com/*", cookieStoreId: cookie.storeId });
  for (const tab of tabs) browser.tabs.sendMessage(tab.id, { type: "viewer-id-changed", id });
});
