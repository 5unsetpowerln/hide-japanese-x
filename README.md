# Hide Japanese Posts on X

A Firefox extension that hides posts whose original text is Japanese on x.com, only while you
are signed in to x.com with one of the accounts you register.

## How it decides

- **Original language.** A post is judged by the language that X detected for its original text
  (`legacy.lang` in X's API responses), not by the text on the screen. When X shows an
  automatic translation of a post, the text on the screen is in the translated language, but
  the post is still judged by the language of the original.
- **Signed-in account.** Hiding is enabled only while the signed-in account is one of the
  registered usernames. The account is read from the **Profile** link in x.com's navigation,
  and switching accounts takes effect without a reload.
- **What is hidden.** A post is hidden with its whole timeline cell. A repost is judged by the
  reposted post. A quoted post is not judged on its own, so a non-Japanese post that quotes a
  Japanese one stays. Posts whose language X did not detect (for example, media only) stay.

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

x.com serves signed-in users a client that loads posts from its GraphQL API through
`XMLHttpRequest`. `src/page.js` runs in the page before x.com's scripts, reads those responses,
and records `legacy.lang` of every post by its ID (`rest_id`). It then finds each post's ID in
the link of the post's timestamp and hides the timeline cell (`data-testid="cellInnerDiv"`) of
a Japanese post.

`src/content.js` keeps the registered usernames out of the page. It reads the signed-in
account from the navigation's profile link (`data-testid="AppTabBar_Profile_Link"`) and tells
`src/page.js` only whether hiding is enabled.

## Limitations

- The extension depends on internals of the client that x.com serves to signed-in users (the
  shape of its API responses and its DOM). An update of x.com can break it. x.com serves a
  different client to visitors who are not signed in, where the extension does nothing.
- If the navigation shows no **Profile** link (for example, in a very narrow window), the
  signed-in account is not recognized and nothing is hidden.

## Testing

`npm install`, then `npm test`. Both tests run in headless Firefox through selenium-webdriver.
`test/page.test.mjs` runs `src/page.js` on a local page that imitates x.com's client.
`test/e2e.mjs` installs the extension and checks the options page and the account matching on
the live x.com, so it needs network access. Set `FIREFOX` to use a Firefox binary other than the
default one.
