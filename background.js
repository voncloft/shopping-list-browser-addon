"use strict";

(function () {
  const browserApi = typeof browser !== "undefined"
    ? browser
    : (typeof chrome !== "undefined" ? chrome : null);
  const SETTINGS_KEY = "serverSettings";
  const DEBUG_LOG_KEY = "debugLogs";
  const MAX_DEBUG_LOG_ENTRIES = 200;

  if (!browserApi?.runtime?.onMessage) {
    return;
  }

  function getDefaultSettings() {
    return {
      serverBaseUrl: "http://voncloft.shopping.com",
      priceEndpoint: "/ajax/edit_price.php",
      autoSubmit: true
    };
  }

  function buildServerUrl(settings) {
    if (!settings?.serverBaseUrl || !settings?.priceEndpoint) {
      throw new Error("Server URL and endpoint are required.");
    }

    return new URL(settings.priceEndpoint, settings.serverBaseUrl).toString();
  }

  async function getServerSettings() {
    const stored = await browserApi.storage.local.get({ [SETTINGS_KEY]: getDefaultSettings() });
    return stored[SETTINGS_KEY];
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

  function sanitizeValue(value, depth = 0) {
    if (value === null || value === undefined) {
      return value;
    }

    if (depth > 4) {
      return "[max-depth]";
    }

    if (Array.isArray(value)) {
      return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));
    }

    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack || null
      };
    }

    if (typeof value === "object") {
      const result = {};
      for (const [key, nested] of Object.entries(value)) {
        result[key] = sanitizeValue(nested, depth + 1);
      }
      return result;
    }

    if (typeof value === "function") {
      return "[function]";
    }

    return value;
  }

  function getSenderDetails(sender) {
    return {
      senderUrl: sender?.url || null,
      senderOrigin: sender?.origin || null,
      tabUrl: sender?.tab?.url || null,
      tabId: typeof sender?.tab?.id === "number" ? sender.tab.id : null
    };
  }

  async function appendDebugLog(type, details) {
    try {
      const stored = await browserApi.storage.local.get({ [DEBUG_LOG_KEY]: [] });
      const nextEntry = {
        timestamp: new Date().toISOString(),
        type,
        details: sanitizeValue(details)
      };
      const logs = Array.isArray(stored[DEBUG_LOG_KEY]) ? stored[DEBUG_LOG_KEY] : [];
      const trimmed = logs.concat(nextEntry).slice(-MAX_DEBUG_LOG_ENTRIES);
      await browserApi.storage.local.set({ [DEBUG_LOG_KEY]: trimmed });
    } catch (error) {
      console.error("Failed to write debug log", error);
    }
  }

  function formatDebugLogEntry(entry, index) {
    const lines = [
      `#${index + 1} ${entry.timestamp} ${entry.type}`,
      JSON.stringify(entry.details || {}, null, 2)
    ];
    return lines.join("\n");
  }

  async function getDebugLogExport() {
    const stored = await browserApi.storage.local.get({ [DEBUG_LOG_KEY]: [] });
    const entries = Array.isArray(stored[DEBUG_LOG_KEY]) ? stored[DEBUG_LOG_KEY] : [];
    const header = [
      "walmart_price_updater debug log",
      `generated_at: ${new Date().toISOString()}`,
      `extension_version: ${browserApi.runtime.getManifest().version}`,
      `user_agent: ${typeof navigator !== "undefined" ? navigator.userAgent : "unknown"}`,
      `entry_count: ${entries.length}`,
      ""
    ];
    const body = entries.length
      ? entries.map((entry, index) => formatDebugLogEntry(entry, index)).join("\n\n")
      : "No log entries recorded.";
    return {
      filename: "walmart_price_updater-debug-log.txt",
      text: `${header.join("\n")}${body}`
    };
  }

  async function clearDebugLogs() {
    await browserApi.storage.local.set({ [DEBUG_LOG_KEY]: [] });
  }

  async function postServerUpdate(dbId, price, settingsOverride, context) {
    const settings = settingsOverride || await getServerSettings();
    const targetUrl = buildServerUrl(settings);
    const body = new URLSearchParams();
    body.set("id", String(dbId));
    body.set("updated_value", String(price));
    const startedAt = Date.now();

    await appendDebugLog("submit:start", {
      context,
      targetUrl,
      body: body.toString()
    });

    try {
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
        await appendDebugLog("submit:success", {
          context,
          targetUrl,
          elapsedMs: Date.now() - startedAt,
          responseStatus: response.status,
          responsePreview: ""
        });
        return { ok: true };
      }

      const parsed = parseJson(responseText);
      if (!parsed) {
        throw new Error(`Server returned unexpected response: ${responseText.slice(0, 120)}`);
      }

      if (parsed.ok === false) {
        throw new Error(parsed.error || "Server returned ok=false");
      }

      await appendDebugLog("submit:success", {
        context,
        targetUrl,
        elapsedMs: Date.now() - startedAt,
        responseStatus: response.status,
        responsePreview: responseText.slice(0, 240)
      });

      return parsed;
    } catch (error) {
      await appendDebugLog("submit:error", {
        context,
        targetUrl,
        elapsedMs: Date.now() - startedAt,
        error
      });
      throw error;
    }
  }

  async function testServerSettings(settingsOverride, context) {
    const settings = settingsOverride || await getServerSettings();
    const url = buildServerUrl(settings);
    const body = new URLSearchParams();
    body.set("id", "0");
    body.set("updated_value", "0");
    const startedAt = Date.now();

    await appendDebugLog("test:start", {
      context,
      targetUrl: url,
      body: body.toString()
    });

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
        },
        body: body.toString(),
        credentials: "include"
      });

      const text = await response.text();
      const parsed = parseJson(text);

      if (response.ok && (!parsed || parsed.ok !== false)) {
        await appendDebugLog("test:success", {
          context,
          targetUrl: url,
          elapsedMs: Date.now() - startedAt,
          responseStatus: response.status,
          responsePreview: text.slice(0, 240)
        });
        return { url };
      }

      if (parsed?.error === "Invalid id") {
        await appendDebugLog("test:success", {
          context,
          targetUrl: url,
          elapsedMs: Date.now() - startedAt,
          responseStatus: response.status,
          responsePreview: text.slice(0, 240)
        });
        return { url };
      }

      throw new Error(`Server responded ${response.status}: ${text.slice(0, 180)}`);
    } catch (error) {
      await appendDebugLog("test:error", {
        context,
        targetUrl: url,
        elapsedMs: Date.now() - startedAt,
        error
      });
      throw error;
    }
  }

  function buildOk(payload) {
    return { ok: true, ...payload };
  }

  function buildError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }

  browserApi.runtime.onMessage.addListener((message, sender) => {
    const context = sanitizeValue({
      ...getSenderDetails(sender),
      ...(message?.context || {})
    });

    if (message?.type === "submitServerUpdate") {
      return postServerUpdate(message.dbId, message.price, message.settings, context)
        .then((data) => buildOk({ data }))
        .catch((error) => buildError(error));
    }

    if (message?.type === "testServerSettings") {
      return testServerSettings(message.settings, context)
        .then((data) => buildOk(data))
        .catch((error) => buildError(error));
    }

    if (message?.type === "getDebugLogExport") {
      return getDebugLogExport()
        .then((data) => buildOk(data))
        .catch((error) => buildError(error));
    }

    if (message?.type === "clearDebugLogs") {
      return clearDebugLogs()
        .then(() => buildOk({ cleared: true }))
        .catch((error) => buildError(error));
    }

    return undefined;
  });
})();
