"use strict";

const browserApi = typeof browser !== "undefined"
  ? browser
  : (typeof chrome !== "undefined" ? chrome : null);
const SETTINGS_KEY = "serverSettings";

const elements = {
  version: document.getElementById("version"),
  status: document.getElementById("status"),
  serverBaseUrl: document.getElementById("serverBaseUrl"),
  priceEndpoint: document.getElementById("priceEndpoint"),
  autoSubmit: document.getElementById("autoSubmit"),
  saveSettings: document.getElementById("saveSettings"),
  testSettings: document.getElementById("testSettings")
};

if (!browserApi) {
  throw new Error("Browser extension API is not available.");
}

elements.version.textContent = `v${browserApi.runtime.getManifest().version}`;

function getDefaultSettings() {
  return {
    serverBaseUrl: "http://voncloft.shopping.com",
    priceEndpoint: "/ajax/edit_price.php",
    autoSubmit: true
  };
}

function setStatus(message, tone) {
  elements.status.textContent = message;
  elements.status.className = "status";
  if (tone) {
    elements.status.classList.add(tone);
  }
}

function readForm() {
  return {
    serverBaseUrl: elements.serverBaseUrl.value.trim(),
    priceEndpoint: elements.priceEndpoint.value.trim(),
    autoSubmit: elements.autoSubmit.checked
  };
}

function writeForm(settings) {
  elements.serverBaseUrl.value = settings.serverBaseUrl || "";
  elements.priceEndpoint.value = settings.priceEndpoint || "";
  elements.autoSubmit.checked = Boolean(settings.autoSubmit);
}

function buildServerUrl(settings) {
  if (!settings.serverBaseUrl || !settings.priceEndpoint) {
    throw new Error("Server URL and endpoint are required.");
  }

  return new URL(settings.priceEndpoint, settings.serverBaseUrl).toString();
}

async function saveSettings() {
  const settings = readForm();
  buildServerUrl(settings);
  await browserApi.storage.local.set({ [SETTINGS_KEY]: settings });
  setStatus("Saved server settings.", "good");
}

async function testSettings() {
  const settings = readForm();
  const url = buildServerUrl(settings);
  const body = new URLSearchParams();
  body.set("id", "0");
  body.set("updated_value", "0");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
    },
    body: body.toString(),
    credentials: "include"
  });

  const text = await response.text();
  let parsed = null;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    parsed = null;
  }

  if (response.ok && (!parsed || parsed.ok !== false)) {
    setStatus(`Endpoint reachable: ${url}`, "good");
    return;
  }

  if (parsed && parsed.error === "Invalid id") {
    setStatus(`Endpoint reachable: ${url}`, "good");
    return;
  }

  throw new Error(`Server responded ${response.status}: ${text.slice(0, 180)}`);
}

async function init() {
  const stored = await browserApi.storage.local.get({ [SETTINGS_KEY]: getDefaultSettings() });
  writeForm(stored[SETTINGS_KEY]);
}

elements.saveSettings.addEventListener("click", () => {
  saveSettings().catch((error) => {
    setStatus(error.message || String(error), "bad");
  });
});

elements.testSettings.addEventListener("click", () => {
  testSettings().catch((error) => {
    setStatus(error.message || String(error), "bad");
  });
});

init().catch((error) => {
  setStatus(error.message || String(error), "bad");
});
