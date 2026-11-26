// End-to-end test of the installed extension on the live x.com in headless Firefox.
//
// The test cannot sign in, and x.com serves a different client to visitors who are not signed
// in, so it checks the parts that do not depend on that client: the signed-in account is read
// from the navigation's profile link (which the test adds to the page), the options page
// stores the usernames, and content.js decides whether hiding is enabled.
// test/page.test.mjs checks the hiding itself.
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { Builder, By, until } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";

const EXTENSION_ID = "hide-japanese-x@local";
const EXTENSION_UUID = "6b0a2c5e-3f1d-4c8e-9a7b-2d4e6f8a0b1c";
const OPTIONS_URL = `moz-extension://${EXTENSION_UUID}/src/options.html`;

// Firefox refuses to let WebDriver navigate to moz-extension: pages without system access.
process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS = "1";
const options = new firefox.Options()
  .addArguments("-headless")
  .setPreference("extensions.webextensions.uuids", JSON.stringify({ [EXTENSION_ID]: EXTENSION_UUID }));
if (process.env.FIREFOX) options.setBinary(process.env.FIREFOX);
const driver = await new Builder().forBrowser("firefox").setFirefoxOptions(options).build();

async function openSignedInAs(screenName) {
  await driver.get("https://x.com/nhk_news");
  await driver.wait(until.elementLocated(By.css("article")), 60000);
  await driver.executeScript((screenName) => {
    const link = document.createElement("a");
    link.dataset.testid = "AppTabBar_Profile_Link";
    link.href = `/${screenName}`;
    document.body.append(link);
  }, screenName);
  await sleep(500);
}

async function extensionState() {
  return driver.executeAsyncScript((done) => {
    document.addEventListener("hide-japanese-x:state", (event) => done(JSON.parse(event.detail)), { once: true });
    document.dispatchEvent(new CustomEvent("hide-japanese-x:request"));
  });
}

async function stateAfterSwitchingTo(screenName) {
  return driver.executeAsyncScript((screenName, done) => {
    document.addEventListener("hide-japanese-x:state", (event) => done(JSON.parse(event.detail)), { once: true });
    document.querySelector('[data-testid="AppTabBar_Profile_Link"]').href = `/${screenName}`;
  }, screenName);
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

async function lastViewer() {
  await driver.get(OPTIONS_URL);
  return driver.wait(until.elementLocated(By.id("last-viewer")), 10000).getText();
}

try {
  await driver.installAddon(fileURLToPath(new URL("../hide-japanese-x.xpi", import.meta.url)), true);
  // The extension opens its options page in the current tab on install; wait for it so that
  // it does not replace the next page the test opens.
  await driver.wait(async () => (await driver.getCurrentUrl()) === OPTIONS_URL, 10000);

  await openSignedInAs("nhk_news");
  assert.deepEqual(await extensionState(), { enabled: false }, "an unregistered account does not enable hiding");
  assert.equal(await lastViewer(), "Signed-in account last seen on x.com: @nhk_news");

  assert.deepEqual(await saveUsernames("bad name!"), {
    status: "Not a valid username: name!",
    textarea: "bad name!",
  });
  assert.deepEqual(await saveUsernames("@NHK_News\nXDevelopers nhk_news"), {
    status: "Saved.",
    textarea: "nhk_news\nxdevelopers",
  });

  await openSignedInAs("nhk_news");
  assert.deepEqual(await extensionState(), { enabled: true }, "a registered account enables hiding");
  assert.deepEqual(await stateAfterSwitchingTo("someone_else"), { enabled: false }, "switching accounts is followed");
  assert.deepEqual(await stateAfterSwitchingTo("XDevelopers"), { enabled: true });

  console.log("e2e: all checks passed.");
} finally {
  await driver.quit();
}
