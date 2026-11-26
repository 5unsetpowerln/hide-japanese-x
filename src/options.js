const textarea = document.getElementById("usernames");
const status = document.getElementById("status");
const lastViewer = document.getElementById("last-viewer");

function showStatus(message, isError) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function showLastViewer(viewer) {
  lastViewer.textContent = viewer
    ? `Signed-in account last seen on x.com: @${viewer}`
    : "No signed-in account has been seen on x.com yet.";
}

document.getElementById("save").addEventListener("click", async () => {
  const entries = textarea.value.split(/\s+/).filter(Boolean).map((entry) => entry.replace(/^@/, ""));
  const invalid = entries.filter((entry) => !/^\w{1,15}$/.test(entry));
  if (invalid.length > 0) {
    showStatus(`Not a valid username: ${invalid.join(", ")}`, true);
    return;
  }
  // x.com usernames are case-insensitive.
  const usernames = [...new Set(entries.map((entry) => entry.toLowerCase()))];
  await browser.storage.local.set({ usernames });
  textarea.value = usernames.join("\n");
  showStatus("Saved.", false);
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.lastViewer) showLastViewer(changes.lastViewer.newValue);
});

browser.storage.local.get(["usernames", "lastViewer"]).then((stored) => {
  textarea.value = (stored.usernames ?? []).join("\n");
  showLastViewer(stored.lastViewer);
});
