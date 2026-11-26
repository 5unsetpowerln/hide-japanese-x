// End-to-end test against the live x.com in headless Firefox.
//
// The test cannot sign in, and x.com stops rendering posts as soon as a twid cookie appears
// without a session. So it checks the extension in two halves:
// - hiding: page.js is switched on through the same event that content.js uses, on real pages;
// - deciding: a host-only twid cookie fakes the signed-in account (x.com removes a twid cookie
//   set for .x.com), and the state that content.js sends back is read through that event.
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { Builder, By, until } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";

const EXTENSION_ID = "hide-japanese-x@local";
const EXTENSION_UUID = "6b0a2c5e-3f1d-4c8e-9a7b-2d4e6f8a0b1c";
const OPTIONS_URL = `moz-extension://${EXTENSION_UUID}/src/options.html`;
const NHK_NEWS_ID = "204245399";

// Firefox refuses to let WebDriver navigate to moz-extension: pages without system access.
process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS = "1";
const options = new firefox.Options()
  .addArguments("-headless")
  .setPreference("extensions.webextensions.uuids", JSON.stringify({ [EXTENSION_ID]: EXTENSION_UUID }));
if (process.env.FIREFOX) options.setBinary(process.env.FIREFOX);
const driver = await new Builder().forBrowser("firefox").setFirefoxOptions(options).build();

async function openTimeline(screenName) {
  await driver.get(`https://x.com/${screenName}`);
  await driver.wait(until.elementLocated(By.css("article")), 60000);
  await sleep(2000);
}

async function setHiding(enabled) {
  await driver.executeScript((enabled) => {
    const detail = JSON.stringify({ viewerId: null, enabled });
    document.dispatchEvent(new CustomEvent("hide-japanese-x:state", { detail }));
  }, enabled);
  await sleep(500);
}

async function posts() {
  return driver.executeScript(() =>
    [...document.querySelectorAll("article")].map((article) => {
      const text = [...article.querySelectorAll('div[dir="auto"][lang]')].find(
        (element) => element.closest("article") === article,
      );
      return { lang: text?.getAttribute("lang") ?? null, visible: article.checkVisibility() };
    }),
  );
}

async function extensionState() {
  return driver.executeAsyncScript((done) => {
    document.addEventListener("hide-japanese-x:state", (event) => done(JSON.parse(event.detail)), { once: true });
    document.dispatchEvent(new CustomEvent("hide-japanese-x:request"));
  });
}

async function openSignedInAs(screenName, userId) {
  await driver.get("https://x.com/");
  await driver.manage().addCookie({ name: "twid", value: `u%3D${userId}`, path: "/", secure: true });
  await driver.get(`https://x.com/${screenName}`);
  await sleep(6000);
}

async function saveUsernames(text) {
  await driver.get(OPTIONS_URL);
  const textarea = await driver.wait(until.elementLocated(By.id("usernames")), 10000);
  await textarea.clear();
  await textarea.sendKeys(text);
  await driver.findElement(By.id("save")).click();
  const status = driver.findElement(By.id("status"));
  await driver.wait(async () => (await status.getText()) !== "", 10000);
  return { status: await status.getText(), textarea: await textarea.getAttribute("value") };
}

try {
  await driver.installAddon(fileURLToPath(new URL("../hide-japanese-x.xpi", import.meta.url)), true);
  // The extension opens its options page in the current tab on install; wait for it so that
  // it does not replace the next page the test opens.
  await driver.wait(async () => (await driver.getCurrentUrl()) === OPTIONS_URL, 10000);

  await openTimeline("nhk_news");
  let result = await posts();
  console.log("nhk_news, signed out:", result);
  assert.ok(result.some((post) => post.lang === "ja"));
  assert.ok(result.every((post) => post.visible), "nothing is hidden while signed out");
  await setHiding(true);
  result = await posts();
  console.log("nhk_news, hiding:", result);
  assert.ok(result.every((post) => post.visible === (post.lang !== "ja")), "only Japanese posts are hidden");
  await setHiding(false);
  assert.ok((await posts()).every((post) => post.visible), "hidden posts come back");

  await openTimeline("XDevelopers");
  await setHiding(true);
  result = await posts();
  console.log("XDevelopers, hiding:", result);
  assert.ok(result.some((post) => post.lang !== "ja"));
  assert.ok(result.every((post) => post.visible === (post.lang !== "ja")), "non-Japanese posts stay visible");

  // x.com switches accounts by changing the twid cookie without reloading the page.
  await openTimeline("nhk_news");
  await driver.executeScript(() => (window.notReloaded = true));
  await driver.manage().addCookie({ name: "twid", value: `u%3D${NHK_NEWS_ID}`, path: "/", secure: true });
  await sleep(1000);
  assert.deepEqual(await extensionState(), { viewerId: NHK_NEWS_ID, enabled: false });
  assert.equal(await driver.executeScript(() => window.notReloaded), true);
  await driver.manage().deleteCookie("twid");

  assert.deepEqual(await saveUsernames("bad name!"), {
    status: "Not a valid username: name!",
    textarea: "bad name!",
  });

  await openSignedInAs("nhk_news", NHK_NEWS_ID);
  let state = await extensionState();
  console.log("signed in as nhk_news, not registered:", state);
  assert.deepEqual(state, { viewerId: NHK_NEWS_ID, enabled: false });
  await driver.get(OPTIONS_URL);
  assert.equal(await driver.findElement(By.id("last-viewer")).getText(), "Signed-in account last seen on x.com: @nhk_news");

  assert.deepEqual(await saveUsernames("@NHK_News\nXDevelopers nhk_news"), {
    status: "Saved.",
    textarea: "nhk_news\nxdevelopers",
  });
  await openSignedInAs("nhk_news", NHK_NEWS_ID);
  state = await extensionState();
  console.log("signed in as nhk_news, registered:", state);
  assert.deepEqual(state, { viewerId: NHK_NEWS_ID, enabled: true });

  console.log("All checks passed.");
} finally {
  await driver.quit();
}
