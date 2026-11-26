// Tests src/page.js on a local page that imitates the client x.com serves to signed-in users:
// posts arrive through XMLHttpRequest from a GraphQL endpoint and are rendered as articles in
// timeline cells, and the text's lang attribute shows the language on the screen.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import { Builder, By, until } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";

const tweet = (id, lang, extra = {}) => ({
  __typename: "Tweet",
  rest_id: id,
  legacy: { lang, full_text: `post ${id}` },
  ...extra,
});
const entry = (result) => ({ content: { itemContent: { tweet_results: { result } } } });

const timeline = {
  data: {
    home: {
      home_timeline_urt: {
        instructions: [
          {
            entries: [
              entry(tweet("1", "ja")),
              entry(tweet("2", "ja", { grok_translated_post: { destination_language: "en" } })),
              entry(tweet("3", "en", { grok_translated_post: { destination_language: "ja" } })),
              entry(tweet("40", "zxx", { legacy: { lang: "zxx", retweeted_status_result: { result: tweet("4", "ja") } } })),
              entry(tweet("5", "en", { quoted_status_result: { result: tweet("50", "ja") } })),
              entry({ __typename: "TweetWithVisibilityResults", tweet: tweet("6", "ja") }),
              { content: { user_results: { result: { rest_id: "999", legacy: { screen_name: "someone" } } } } },
            ],
          },
        ],
      },
    },
  },
};
const more = { data: { tweet_results: { result: tweet("8", "ja") } } };

// [post ID, lang attribute of the text on the screen, extra markup inside the article]
const posts = [
  ["1", "ja", ""],
  ["2", "en", ""],
  ["3", "ja", ""],
  ["4", "ja", '<a href="/reposter">reposter reposted</a>'],
  ["5", "en", '<div role="link"><time>2h</time><div data-testid="tweetText" dir="auto" lang="ja">quoted</div></div>'],
  ["6", "ja", ""],
  ["7", "ja", ""],
];

const fixture = `<!doctype html>
<html><head><meta charset="utf-8"><link rel="stylesheet" href="/src/hide.css">
<script src="/src/page.js"></script></head>
<body><main></main><script>
function render([id, lang, extra]) {
  const cell = document.createElement("div");
  cell.dataset.testid = "cellInnerDiv";
  cell.innerHTML = '<article role="article" data-testid="tweet" data-post="' + id + '">' + extra +
    '<a href="/author/status/' + id + '"><time>1h</time></a>' +
    '<div data-testid="tweetText" dir="auto" lang="' + lang + '">text</div></article>';
  document.querySelector("main").append(cell);
}
function request(path, responseType, onLoad) {
  const xhr = new XMLHttpRequest();
  xhr.open("GET", path);
  xhr.responseType = responseType;
  xhr.addEventListener("load", onLoad);
  xhr.send();
}
request("/i/api/graphql/q1/HomeTimeline", "", () => ${JSON.stringify(posts)}.forEach(render));
window.addLater = () => request("/i/api/graphql/q2/TweetResultByRestId", "json", () => render(["8", "ja", ""]));
</script></body></html>`;

const files = { "/src/page.js": "text/javascript", "/src/hide.css": "text/css" };
const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  if (path === "/") return response.writeHead(200, { "content-type": "text/html" }).end(fixture);
  if (path.endsWith("/HomeTimeline")) return response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(timeline));
  if (path.endsWith("/TweetResultByRestId")) return response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(more));
  if (files[path]) {
    const body = await readFile(new URL(`..${path}`, import.meta.url));
    return response.writeHead(200, { "content-type": files[path] }).end(body);
  }
  response.writeHead(404).end();
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

const options = new firefox.Options().addArguments("-headless");
if (process.env.FIREFOX) options.setBinary(process.env.FIREFOX);
const driver = await new Builder().forBrowser("firefox").setFirefoxOptions(options).build();

async function setHiding(enabled) {
  await driver.executeScript((enabled) => {
    document.dispatchEvent(new CustomEvent("hide-japanese-x:state", { detail: JSON.stringify({ enabled }) }));
  }, enabled);
  await sleep(300);
}

async function hiddenPosts() {
  return driver.executeScript(() =>
    [...document.querySelectorAll("article")]
      .filter((article) => !article.checkVisibility())
      .map((article) => article.dataset.post),
  );
}

try {
  await driver.get(`http://127.0.0.1:${server.address().port}/`);
  await driver.wait(until.elementsLocated(By.css('[data-post="7"]')), 10000);
  await sleep(300);
  assert.deepEqual(await hiddenPosts(), [], "nothing is hidden until hiding is enabled");

  await setHiding(true);
  assert.deepEqual(await hiddenPosts(), ["1", "2", "4", "6"], "posts whose original text is Japanese are hidden");
  assert.equal(
    await driver.executeScript(() => document.querySelector('[data-post="1"]').parentElement.hasAttribute("data-hide-japanese-x")),
    true,
    "the whole timeline cell is hidden",
  );

  await driver.executeScript(() => window.addLater());
  await driver.wait(until.elementsLocated(By.css('[data-post="8"]')), 10000);
  await sleep(300);
  assert.deepEqual(await hiddenPosts(), ["1", "2", "4", "6", "8"], "posts added later are hidden too");

  await setHiding(false);
  assert.deepEqual(await hiddenPosts(), [], "hidden posts come back");
  console.log("page.js: all checks passed.");
} finally {
  await driver.quit();
  server.close();
}
