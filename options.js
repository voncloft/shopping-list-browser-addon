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
  testSettings: document.getElementById("testSettings"),
  downloadLogs: document.getElementById("downloadLogs"),
  clearLogs: document.getElementById("clearLogs")
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

async function sendRuntimeMessage(message) {
  const response = await browserApi.runtime.sendMessage(message);
  if (!response || response.ok !== true) {
    throw new Error(response?.error || "Background request failed.");
  }
  return response;
}

async function saveSettings() {
  const settings = readForm();
  buildServerUrl(settings);
  await browserApi.storage.local.set({ [SETTINGS_KEY]: settings });
  setStatus("Saved server settings.", "good");
}

async function testSettings() {
  const settings = readForm();
  buildServerUrl(settings);
  const response = await sendRuntimeMessage({
    type: "testServerSettings",
    settings,
    context: {
      source: "options"
    }
  });
  setStatus(`Endpoint reachable: ${response.url}`, "good");
}

async function downloadLogs() {
  const response = await sendRuntimeMessage({
    type: "getDebugLogExport",
    context: {
      source: "options"
    }
  });
  const blob = new Blob([response.text], { type: "text/plain;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);

  try {
    await browserApi.downloads.download({
      url: objectUrl,
      filename: response.filename,
      saveAs: true,
      conflictAction: "uniquify"
    });
  } finally {
    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 1000);
  }

  setStatus("Downloaded debug log.", "good");
}

async function clearLogs() {
  await sendRuntimeMessage({
    type: "clearDebugLogs",
    context: {
      source: "options"
    }
  });
  setStatus("Cleared debug logs.", "good");
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

elements.downloadLogs.addEventListener("click", () => {
  downloadLogs().catch((error) => {
    setStatus(error.message || String(error), "bad");
  });
});

elements.clearLogs.addEventListener("click", () => {
  clearLogs().catch((error) => {
    setStatus(error.message || String(error), "bad");
  });
});

init().catch((error) => {
  setStatus(error.message || String(error), "bad");
});
