"use strict";

const browserApi = typeof browser !== "undefined"
  ? browser
  : (typeof chrome !== "undefined" ? chrome : null);
const MAPPING_KEY = "urlToDbId";
const SETTINGS_KEY = "serverSettings";

const elements = {
  status: document.getElementById("status"),
  title: document.getElementById("title"),
  price: document.getElementById("price"),
  itemId: document.getElementById("itemId"),
  dbId: document.getElementById("dbId"),
  version: document.getElementById("version"),
  serverSummary: document.getElementById("serverSummary"),
  settings: document.getElementById("settings"),
  refresh: document.getElementById("refresh"),
  saveCurrent: document.getElementById("saveCurrent")
};

let currentPageData = null;

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

async function getStoredData() {
  return browserApi.storage.local.get({
    [MAPPING_KEY]: {},
    [SETTINGS_KEY]: getDefaultSettings()
  });
}

function buildServerUrl(settings) {
  if (!settings.serverBaseUrl || !settings.priceEndpoint) {
    return null;
  }

  return new URL(settings.priceEndpoint, settings.serverBaseUrl).toString();
}

function summarizeServer(settings) {
  const url = buildServerUrl(settings);
  if (!url) {
    return "Server not configured";
  }

  const mode = settings.autoSubmit ? "auto-submit on" : "auto-submit off";
  return `${mode}: ${url}`;
}

function encodeBasicAuth(username, password) {
  return btoa(`${username}:${password}`);
}

async function submitServerUpdate(dbId, price, settings) {
  const targetUrl = buildServerUrl(settings);
  if (!targetUrl) {
    throw new Error("Server URL or endpoint is not configured.");
  }

  const body = new URLSearchParams();
  body.set("id", dbId);
  body.set("updated_value", price);

  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
    },
    body: body.toString(),
    credentials: "include"
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Server update failed (${response.status}): ${responseText.slice(0, 120)}`);
  }

  try {
    const json = JSON.parse(responseText);
    if (json && json.ok === false) {
      throw new Error(json.error || "Server returned ok=false");
    }
    return json;
  } catch (error) {
    if (responseText.trim() === "") {
      return { ok: true };
    }
    throw error;
  }
}

async function renderServerSummary() {
  const stored = await getStoredData();
  elements.serverSummary.textContent = summarizeServer(stored[SETTINGS_KEY]);
}

async function getActiveTab() {
  const tabs = await browserApi.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function fetchCurrentPageData() {
  const tab = await getActiveTab();
  if (!tab || !tab.id) {
    throw new Error("No active tab found.");
  }

  if (!tab.url || !tab.url.includes("walmart.com")) {
    throw new Error("Open a Walmart product page first.");
  }

  try {
    const data = await browserApi.tabs.sendMessage(tab.id, { type: "getWalmartData" });
    if (!data || !data.ok) {
      throw new Error("Could not read Walmart page data. Reload the tab and try again.");
    }
    return data;
  } catch (error) {
    await browserApi.tabs.executeScript(tab.id, { file: "content-script.js" });
  }

  const data = await browserApi.tabs.sendMessage(tab.id, { type: "getWalmartData" });
  if (!data || !data.ok) {
    throw new Error("Could not read Walmart page data. Reload the tab and try again.");
  }

  return data;
}

async function refreshCurrentPage() {
  setStatus("Reading current Walmart tab...");

  try {
    currentPageData = await fetchCurrentPageData();
    elements.title.value = currentPageData.title || "";
    elements.price.value = currentPageData.price || "";
    elements.itemId.value = currentPageData.itemId || "";

    const stored = await getStoredData();
    const mappedId = stored[MAPPING_KEY][currentPageData.url];
    elements.dbId.value = currentPageData.dbId || mappedId || "";

    if (currentPageData.price) {
      const dbIdNote = currentPageData.dbId ? ` Link dbid=${currentPageData.dbId}.` : "";
      setStatus(
        `Detected price ${currentPageData.price} from ${currentPageData.source}.${dbIdNote}`,
        "good"
      );
    } else {
      setStatus("Price not found on this page. Make sure the Walmart price is visible first.", "bad");
    }
  } catch (error) {
    currentPageData = null;
    elements.title.value = "";
    elements.price.value = "";
    elements.itemId.value = "";
    elements.dbId.value = "";
    setStatus(error.message || String(error), "bad");
  }
}

async function saveCurrentItem() {
  if (!currentPageData || !currentPageData.price) {
    setStatus("No Walmart price is loaded for the current tab.", "bad");
    return;
  }

  const dbId = String(elements.dbId.value || "").trim();
  if (!/^\d+$/.test(dbId)) {
    setStatus("Enter a numeric items.ID before saving.", "bad");
    return;
  }

  const stored = await getStoredData();
  const mappings = stored[MAPPING_KEY];
  const settings = stored[SETTINGS_KEY];

  mappings[currentPageData.url] = dbId;

  await browserApi.storage.local.set({
    [MAPPING_KEY]: mappings
  });

  let serverMessage = "";
  if (settings.autoSubmit) {
    try {
      const serverResponse = await submitServerUpdate(dbId, currentPageData.price, settings);
      const affectedRows = serverResponse && typeof serverResponse.affected_rows !== "undefined"
        ? ` affected=${serverResponse.affected_rows}.`
        : "";
      serverMessage = ` Server updated.${affectedRows}`;
    } catch (error) {
      await renderServerSummary();
      setStatus(`Saved locally, but server update failed: ${error.message || error}`, "bad");
      return;
    }
  } else {
    serverMessage = " Auto-submit is off.";
  }

  await renderServerSummary();
  setStatus(`Saved ID ${dbId} at price ${currentPageData.price}.${serverMessage}`, "good");
}

function openSettingsPage() {
  browserApi.runtime.openOptionsPage();
}

elements.settings.addEventListener("click", openSettingsPage);
elements.refresh.addEventListener("click", refreshCurrentPage);
elements.saveCurrent.addEventListener("click", saveCurrentItem);

renderServerSummary().then(refreshCurrentPage);
