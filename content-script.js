"use strict";

(function () {
  const browserApi = typeof browser !== "undefined"
    ? browser
    : (typeof chrome !== "undefined" ? chrome : null);
  const CLICK_MAP_KEY = "clickedDbIdsByItemId";
  const SETTINGS_KEY = "serverSettings";
  const PANEL_ID = "walmart-sql-helper-panel";
  let panelElements = null;
  let currentUrl = location.href;

  if (!browserApi) {
    return;
  }

  function parseJson(text) {
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      return null;
    }
  }

  function extractItemIdFromUrl(url) {
    const match = (url || "").match(/\/(\d+)(?:\?|$)/);
    return match ? match[1] : null;
  }

  function extractDbIdFromHash(url) {
    try {
      const parsed = new URL(url || location.href);
      const hash = parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash;
      const params = new URLSearchParams(hash);
      const dbId = params.get("dbid") || params.get("id");
      if (dbId && /^\d+$/.test(dbId)) {
        return dbId;
      }

      if (/^\d+$/.test(hash)) {
        return hash;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  async function getClickedDbId(itemId) {
    if (!itemId) {
      return null;
    }

    try {
      const stored = await browserApi.storage.local.get({ [CLICK_MAP_KEY]: {} });
      const mapped = stored[CLICK_MAP_KEY]?.[itemId];
      return mapped && /^\d+$/.test(String(mapped)) ? String(mapped) : null;
    } catch (error) {
      return null;
    }
  }

  async function rememberClickedDbId(url) {
    const dbId = extractDbIdFromHash(url);
    const itemId = extractItemIdFromUrl(url);

    if (!dbId || !itemId) {
      return;
    }

    const stored = await browserApi.storage.local.get({ [CLICK_MAP_KEY]: {} });
    const updated = Object.assign({}, stored[CLICK_MAP_KEY], {
      [itemId]: dbId
    });
    await browserApi.storage.local.set({ [CLICK_MAP_KEY]: updated });
  }

  async function rememberDbIdForItem(itemId, dbId) {
    if (!itemId || !dbId || !/^\d+$/.test(String(dbId))) {
      return;
    }

    const stored = await browserApi.storage.local.get({ [CLICK_MAP_KEY]: {} });
    const updated = Object.assign({}, stored[CLICK_MAP_KEY], {
      [itemId]: String(dbId)
    });
    await browserApi.storage.local.set({ [CLICK_MAP_KEY]: updated });
  }

  function installShoppingLinkTracker() {
    if (location.hostname !== "voncloft.shopping.com") {
      return;
    }

    document.addEventListener(
      "click",
      (event) => {
        const anchor = event.target && event.target.closest
          ? event.target.closest("a[href*='walmart.com']")
          : null;
        if (!anchor) {
          return;
        }

        rememberClickedDbId(anchor.href).catch(() => {});
      },
      true
    );
  }

  function getDefaultSettings() {
    return {
      serverBaseUrl: "http://voncloft.shopping.com",
      priceEndpoint: "/ajax/edit_price.php",
      autoSubmit: true
    };
  }

  function buildServerUrl(settings) {
    if (!settings.serverBaseUrl || !settings.priceEndpoint) {
      throw new Error("Server URL and endpoint are required.");
    }

    return new URL(settings.priceEndpoint, settings.serverBaseUrl).toString();
  }

  async function getServerSettings() {
    const stored = await browserApi.storage.local.get({ [SETTINGS_KEY]: getDefaultSettings() });
    return stored[SETTINGS_KEY];
  }

  async function submitServerUpdate(dbId, price) {
    const settings = await getServerSettings();
    const targetUrl = buildServerUrl(settings);
    const body = new URLSearchParams();
    body.set("id", String(dbId));
    body.set("updated_value", String(price));

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

    if (!responseText.trim()) {
      return { ok: true };
    }

    const json = JSON.parse(responseText);
    if (json && json.ok === false) {
      throw new Error(json.error || "Server returned ok=false");
    }

    return json;
  }

  function setPanelStatus(message, tone) {
    if (!panelElements) {
      return;
    }

    panelElements.status.textContent = message;
    panelElements.status.dataset.tone = tone || "neutral";
    panelElements.status.style.color =
      tone === "good" ? "#0f5132" : tone === "bad" ? "#842029" : "#4a5568";
  }

  function setPanelBusy(isBusy) {
    if (!panelElements) {
      return;
    }

    panelElements.button.disabled = isBusy;
    panelElements.button.textContent = isBusy ? "Updating..." : "Update Server";
  }

  function createPanel() {
    if (location.hostname !== "www.walmart.com") {
      return null;
    }

    const existing = document.getElementById(PANEL_ID);
    if (existing) {
      return panelElements;
    }

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.style.position = "fixed";
    panel.style.right = "18px";
    panel.style.bottom = "18px";
    panel.style.zIndex = "2147483647";
    panel.style.width = "260px";
    panel.style.padding = "14px";
    panel.style.border = "1px solid #d8dee8";
    panel.style.borderRadius = "14px";
    panel.style.background = "#fffaf0";
    panel.style.boxShadow = "0 16px 40px rgba(15, 23, 42, 0.18)";
    panel.style.fontFamily = "Arial, sans-serif";
    panel.style.color = "#1f2937";

    const title = document.createElement("div");
    title.textContent = "Walmart SQL Helper";
    title.style.fontSize = "14px";
    title.style.fontWeight = "700";
    title.style.marginBottom = "10px";

    const meta = document.createElement("div");
    meta.style.fontSize = "12px";
    meta.style.lineHeight = "1.5";
    meta.style.marginBottom = "10px";

    const priceLine = document.createElement("div");
    const dbIdLine = document.createElement("div");
    const itemIdLine = document.createElement("div");
    meta.append(priceLine, dbIdLine, itemIdLine);

    const status = document.createElement("div");
    status.style.fontSize = "12px";
    status.style.lineHeight = "1.4";
    status.style.minHeight = "34px";
    status.style.marginBottom = "10px";

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "8px";

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Update Server";
    button.style.flex = "1";
    button.style.border = "0";
    button.style.borderRadius = "10px";
    button.style.padding = "10px 12px";
    button.style.background = "#0f766e";
    button.style.color = "#ffffff";
    button.style.fontWeight = "700";
    button.style.cursor = "pointer";

    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.textContent = "Refresh";
    refresh.style.border = "1px solid #cbd5e1";
    refresh.style.borderRadius = "10px";
    refresh.style.padding = "10px 12px";
    refresh.style.background = "#ffffff";
    refresh.style.color = "#334155";
    refresh.style.cursor = "pointer";

    actions.append(button, refresh);
    panel.append(title, meta, status, actions);
    document.documentElement.appendChild(panel);

    panelElements = {
      panel,
      priceLine,
      dbIdLine,
      itemIdLine,
      status,
      button,
      refresh
    };

    return panelElements;
  }

  function renderPanelData(data) {
    if (!panelElements) {
      return;
    }

    panelElements.priceLine.textContent = `Price: ${data?.price ? `$${data.price}` : "not found"}`;
    panelElements.dbIdLine.textContent = `DB ID: ${data?.dbId || "missing"}`;
    panelElements.itemIdLine.textContent = `Walmart Item ID: ${data?.itemId || "missing"}`;

    if (data?.price && data?.dbId) {
      setPanelStatus("Ready to update the server.", "good");
    } else if (data?.price) {
      setPanelStatus("Price found, but DB ID is missing.", "bad");
    } else {
      setPanelStatus("Waiting for Walmart price data on this page.", "neutral");
    }
  }

  function formatPrice(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const number = Number(value);
    if (!Number.isFinite(number)) {
      return null;
    }

    return number.toFixed(2);
  }

  function getNextData() {
    return parseJson(document.getElementById("__NEXT_DATA__")?.textContent || "");
  }

  function getJsonLdBlocks() {
    return Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .map((node) => parseJson(node.textContent))
      .filter(Boolean);
  }

  function findProductJsonLd(value) {
    if (!value) {
      return null;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const result = findProductJsonLd(item);
        if (result) {
          return result;
        }
      }
      return null;
    }

    if (typeof value !== "object") {
      return null;
    }

    if (value["@type"] === "Product") {
      return value;
    }

    for (const nested of Object.values(value)) {
      const result = findProductJsonLd(nested);
      if (result) {
        return result;
      }
    }

    return null;
  }

  function extractFromProductData(nextData) {
    const product = nextData?.props?.pageProps?.initialData?.data?.product;
    if (!product) {
      return null;
    }

    const variantPriceInfo =
      product.id && product.variantsMap ? product.variantsMap[product.id]?.priceInfo : null;
    const priceInfo = product.priceInfo || variantPriceInfo;
    const currentPrice = priceInfo?.currentPrice;
    const rawPrice =
      currentPrice?.price ??
      currentPrice?.priceString ??
      currentPrice?.priceDisplay ??
      null;

    return {
      price: formatPrice(rawPrice),
      title: product.name || product.productName || null,
      itemId: extractItemIdFromUrl(location.href),
      dbId: extractDbIdFromHash(location.href),
      source: "product"
    };
  }

  function extractFromSearchResults(nextData) {
    const itemId = extractItemIdFromUrl(location.href);
    if (!itemId) {
      return null;
    }

    const stacks = nextData?.props?.pageProps?.initialData?.searchResult?.itemStacks || [];
    for (const stack of stacks) {
      for (const item of stack.items || []) {
        if (String(item.usItemId) !== itemId) {
          continue;
        }

        const priceInfo = item.priceInfo || {};
        const rawPrice =
          priceInfo.linePriceDisplay ??
          priceInfo.linePrice ??
          priceInfo.minPrice ??
          null;

        return {
          price: formatPrice(rawPrice),
          title: item.name || null,
          itemId,
          dbId: extractDbIdFromHash(location.href),
          source: "search"
        };
      }
    }

    return null;
  }

  function extractFromJsonLd() {
    for (const block of getJsonLdBlocks()) {
      const product = findProductJsonLd(block);
      if (!product) {
        continue;
      }

      const offers = product.offers;
      const offer = Array.isArray(offers) ? offers[0] : offers;
      const rawPrice = offer?.price ?? null;

      return {
        price: formatPrice(rawPrice),
        title: product.name || null,
        itemId: extractItemIdFromUrl(location.href),
        dbId: extractDbIdFromHash(location.href),
        source: "json-ld"
      };
    }

    return null;
  }

  async function extractPageData() {
    const nextData = getNextData();
    const fromProduct = extractFromProductData(nextData);
    if (fromProduct?.price) {
      fromProduct.dbId = fromProduct.dbId || await getClickedDbId(fromProduct.itemId);
      return fromProduct;
    }

    const fromSearch = extractFromSearchResults(nextData);
    if (fromSearch?.price) {
      fromSearch.dbId = fromSearch.dbId || await getClickedDbId(fromSearch.itemId);
      return fromSearch;
    }

    const fromJsonLd = extractFromJsonLd();
    if (fromJsonLd?.price) {
      fromJsonLd.dbId = fromJsonLd.dbId || await getClickedDbId(fromJsonLd.itemId);
      return fromJsonLd;
    }

    const itemId = extractItemIdFromUrl(location.href);
    return {
      price: null,
      title: document.title || null,
      itemId,
      dbId: extractDbIdFromHash(location.href) || await getClickedDbId(itemId),
      source: "none"
    };
  }

  async function refreshInjectedPanel() {
    if (location.hostname !== "www.walmart.com") {
      return;
    }

    createPanel();
    const data = await extractPageData();
    renderPanelData(data);
  }

  async function updateServerFromPage() {
    createPanel();
    setPanelBusy(true);
    setPanelStatus("Reading Walmart page...", "neutral");

    try {
      const data = await extractPageData();
      renderPanelData(data);

      if (!data.price) {
        throw new Error("Price not found on this page.");
      }

      let dbId = data.dbId;
      if (!dbId) {
        const entered = window.prompt("Enter items.ID for this product:");
        if (!entered) {
          setPanelStatus("Update canceled.", "neutral");
          return;
        }
        if (!/^\d+$/.test(entered)) {
          throw new Error("items.ID must be numeric.");
        }
        dbId = entered;
        await rememberDbIdForItem(data.itemId, dbId);
      }

      const response = await submitServerUpdate(dbId, data.price);
      await rememberDbIdForItem(data.itemId, dbId);
      renderPanelData({ ...data, dbId });
      const affectedRows = typeof response?.affected_rows !== "undefined"
        ? ` affected=${response.affected_rows}.`
        : "";
      setPanelStatus(`Updated ID ${dbId} to $${data.price}.${affectedRows}`, "good");
    } catch (error) {
      setPanelStatus(error.message || String(error), "bad");
    } finally {
      setPanelBusy(false);
    }
  }

  function installWalmartUpdatePanel() {
    if (location.hostname !== "www.walmart.com") {
      return;
    }

    createPanel();
    if (!panelElements) {
      return;
    }

    panelElements.button.addEventListener("click", () => {
      updateServerFromPage().catch(() => {});
    });

    panelElements.refresh.addEventListener("click", () => {
      refreshInjectedPanel().catch((error) => {
        setPanelStatus(error.message || String(error), "bad");
      });
    });

    refreshInjectedPanel().catch((error) => {
      setPanelStatus(error.message || String(error), "bad");
    });

    window.setInterval(() => {
      if (location.href === currentUrl) {
        return;
      }

      currentUrl = location.href;
      refreshInjectedPanel().catch((error) => {
        setPanelStatus(error.message || String(error), "bad");
      });
    }, 1500);
  }

  installShoppingLinkTracker();
  installWalmartUpdatePanel();

  browserApi.runtime.onMessage.addListener((message) => {
    if (message?.type !== "getWalmartData") {
      return undefined;
    }

    return extractPageData().then((data) => ({
      ok: true,
      url: location.href,
      ...data
    }));
  });
})();
