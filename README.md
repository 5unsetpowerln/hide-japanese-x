# Hide Japanese Posts on X

A Firefox extension that hides posts whose original text is Japanese on x.com, only while you
are signed in to x.com with one of the accounts you register.

## How it decides

- **Original language.** A post is judged by the language that X detected for its original text
  (`legacy.lang` in X's data), not by the text on the screen. When X shows an automatic
  translation of a post, the post is still judged by the language of the original.
- **Signed-in account.** Hiding is enabled only while the signed-in account is one of the
  registered usernames. The account is taken from the `twid` cookie and resolved to a username
  through X's data, and switching accounts takes effect without a reload.
- **What is hidden.** A post in a timeline is hidden with its whole timeline cell. A Japanese
  post quoted inside a non-Japanese post is hidden on its own. A repost is judged by the
  reposted post. Posts without a detected language (for example, media only) are not hidden.

## Requirements

Firefox 128 or later.

## Install

The extension is not signed by Mozilla, so install it in one of these ways.

### Temporarily, in any Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...** and choose `manifest.json` in this directory.

The extension stays installed until you remove it or restart Firefox.

### Permanently, in Firefox Developer Edition, Nightly, or ESR

1. In `about:config`, set `xpinstall.signatures.required` to `false`.
2. Run `npm run build` in this directory to create `hide-japanese-x.xpi`.
3. In `about:addons`, open the gear menu, choose **Install Add-on From File...**, and select
   `hide-japanese-x.xpi`.

## Usage

The options page opens when the extension is installed. You can also open it from
`about:addons` (the extension's **Preferences**).

Enter the usernames that should enable hiding, one per line, with or without `@`, and click
**Save**. The page also shows the signed-in account that the extension last saw on x.com, which
tells you whether it recognizes your account.

## How it works

x.com renders posts with a Relay-based client. The `lang` attribute of a post's text reflects
only the text on the screen, so it no longer tells the original language once a post is
translated. Instead, `src/page.js` runs in the page before x.com's scripts and defines
`window.__RELAY_DEVTOOLS_HOOK__`, through which Relay hands over its environment. The script
then looks up each post's record in the Relay store by the status ID in the post's link.

`src/content.js` keeps the registered usernames out of the page. It receives the signed-in
account's username from `src/page.js` and tells it only whether hiding is enabled.
`src/background.js` reads the `twid` cookie and relays its changes.

## Limitations

- The extension depends on internals of the current x.com client (the Relay store, its record
  IDs, and the DOM of posts). An update of x.com can break it.
- A post stays visible until its data reaches the Relay store, so a Japanese post can appear
  for a moment before it is hidden.

## Testing

`npm install`, then `npm test`. The test runs the extension in headless Firefox against the live
x.com through selenium-webdriver, so it needs network access. Set `FIREFOX` to use a Firefox
binary other than the default one.
