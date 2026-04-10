const CACHE_NAME = "claude-i18n-cache-v1";
const REMOTE_BASE_URL = "https://claude-web-i18n.vercel.app";
const VERSION_STORAGE_KEY = "claude-i18n:versions";
const BODY_STORAGE_KEY = "claude-i18n:bodies";
const LOCALE_MANIFEST_KEY = "claude-i18n:locale-manifest";

chrome.runtime.onInstalled.addListener(() => {
  fetchAndCacheLocaleManifest().catch((error) => {
    console.warn("[claude-i18n] failed to prefetch locale manifest on install", error);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message) {
    return false;
  }

  if (message.type === "get-locale-manifest") {
    handleGetLocaleManifest()
      .then((manifest) => sendResponse(manifest))
      .catch((error) => {
        console.error("[claude-i18n] get-locale-manifest failed", error);
        sendResponse(null);
      });
    return true;
  }

  if (message.type === "i18n-fetch") {
    handleI18nFetch(message)
      .then((payload) => sendResponse(payload))
      .catch((error) => {
        console.error("[claude-i18n] i18n-fetch failed", error);
        sendResponse({
          status: 500,
          body: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
          headers: {
            "content-type": "application/json; charset=utf-8",
          },
          cacheStatus: "error",
        });
      });
    return true;
  }

  return false;
});

async function handleGetLocaleManifest() {
  const cached = await getStoredLocaleManifest();

  // Background revalidation (stale-while-revalidate)
  fetchAndCacheLocaleManifest().catch((error) => {
    console.warn("[claude-i18n] background locale manifest revalidation failed", error);
  });

  return cached;
}

async function fetchAndCacheLocaleManifest() {
  const response = await fetch(`${REMOTE_BASE_URL}/locales.json`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Locale manifest fetch failed: ${response.status}`);
  }

  const manifest = await response.json();
  const current = await getStoredLocaleManifest();

  if (current?.version === manifest.version) {
    return manifest;
  }

  await chrome.storage.local.set({
    [LOCALE_MANIFEST_KEY]: { ...manifest, fetchedAt: new Date().toISOString() },
  });

  console.log("[claude-i18n] locale manifest updated", { version: manifest.version });
  return manifest;
}

async function getStoredLocaleManifest() {
  const data = await chrome.storage.local.get(LOCALE_MANIFEST_KEY);
  return data[LOCALE_MANIFEST_KEY] ?? null;
}

async function handleI18nFetch(message) {
  const requestUrl = new URL(message.url);
  const resource = getResourceDescriptor(requestUrl, message.locale);
  if (!resource) {
    throw new Error(`Unsupported i18n url: ${message.url}`);
  }

  if (resource.kind === "overrides") {
    return {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
      body: "{}",
      cacheStatus: "inline",
      remoteUrl: null,
    };
  }

  const versionManifest = await fetchVersionManifest(message.locale);
  const versionHash = getResourceHash(versionManifest, resource.kind);
  const versionState = await getStoredVersions();
  const cacheEntry = versionState[resource.cacheKey] ?? null;
  const cacheIsFresh =
    Boolean(versionHash) &&
    cacheEntry?.hash === versionHash &&
    cacheEntry?.builtAt === versionManifest?.builtAt;

  if (cacheIsFresh) {
    const cachedPayload = await readCachedPayload(resource);
    if (cachedPayload) {
      return {
        ...cachedPayload,
        remoteUrl: resource.remoteUrl,
        versionHash,
      };
    }
  }

  const remotePayload = await fetchRemotePayload(resource.remoteUrl);
  await persistPayload(resource, remotePayload, {
    hash: versionHash,
    builtAt: versionManifest?.builtAt ?? null,
    remoteUrl: resource.remoteUrl,
    updatedAt: new Date().toISOString(),
  });

  return {
    ...remotePayload,
    cacheStatus: cacheEntry ? "refresh" : "miss",
    remoteUrl: resource.remoteUrl,
    versionHash,
  };
}

function getResourceDescriptor(requestUrl, locale) {
  if (/^\/i18n\/statsig\/[^/]+\.json$/.test(requestUrl.pathname)) {
    return {
      kind: "statsig",
      cacheKey: `statsig:${locale}`,
      cacheRequest: `https://cache.claude-i18n.local/statsig/${locale}.json`,
      remoteUrl: `${REMOTE_BASE_URL}/i18n/statsig/${locale}.json`,
    };
  }

  if (/^\/i18n\/[^/]+\.overrides\.json$/.test(requestUrl.pathname)) {
    return {
      kind: "overrides",
      cacheKey: `overrides:${locale}`,
      cacheRequest: null,
      remoteUrl: null,
    };
  }

  if (/^\/i18n\/[^/]+\.json$/.test(requestUrl.pathname)) {
    return {
      kind: "base",
      cacheKey: `base:${locale}`,
      cacheRequest: `https://cache.claude-i18n.local/${locale}.json`,
      remoteUrl: `${REMOTE_BASE_URL}/i18n/${locale}.json`,
    };
  }

  return null;
}

async function fetchVersionManifest(locale) {
  const response = await fetch(`${REMOTE_BASE_URL}/version/${locale}.json`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Version manifest fetch failed: ${response.status}`);
  }

  return response.json();
}

function getResourceHash(versionManifest, resourceKind) {
  if (!versionManifest || !Array.isArray(versionManifest.hash)) {
    return null;
  }

  if (resourceKind === "base") {
    return versionManifest.hash[0] ?? null;
  }

  if (resourceKind === "statsig") {
    return versionManifest.hash[1] ?? null;
  }

  return null;
}

async function fetchRemotePayload(remoteUrl) {
  const response = await fetch(remoteUrl, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Remote language pack fetch failed: ${response.status}`);
  }

  return responseToPayload(response);
}

async function readCachedPayload(resource) {
  const cachePayload = await readCacheStoragePayload(resource);
  if (cachePayload) {
    return {
      ...cachePayload,
      cacheStatus: "hit-cache-storage",
    };
  }

  const storagePayload = await readStoragePayload(resource.cacheKey);
  if (storagePayload) {
    return {
      ...storagePayload,
      cacheStatus: "hit-storage-local",
    };
  }

  return null;
}

async function readCacheStoragePayload(resource) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(resource.cacheRequest);
    if (!cachedResponse) {
      return null;
    }

    return responseToPayload(cachedResponse);
  } catch (error) {
    console.warn("[claude-i18n] cache storage read failed", {
      cacheKey: resource.cacheKey,
      error,
    });
    return null;
  }
}

async function persistPayload(resource, payload, versionValue) {
  await Promise.all([
    writeCacheStoragePayload(resource, payload),
    writeStoragePayload(resource.cacheKey, payload),
    setStoredVersion(resource.cacheKey, versionValue),
  ]);
}

async function writeCacheStoragePayload(resource, payload) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = new Response(payload.body, {
      status: payload.status,
      headers: payload.headers,
    });
    await cache.put(resource.cacheRequest, response);
  } catch (error) {
    console.warn("[claude-i18n] cache storage write failed", {
      cacheKey: resource.cacheKey,
      error,
    });
  }
}

async function getStoredVersions() {
  const data = await chrome.storage.local.get(VERSION_STORAGE_KEY);
  return data[VERSION_STORAGE_KEY] ?? {};
}

async function setStoredVersion(cacheKey, value) {
  const current = await getStoredVersions();
  current[cacheKey] = value;
  await chrome.storage.local.set({
    [VERSION_STORAGE_KEY]: current,
  });
}

async function readStoragePayload(cacheKey) {
  try {
    const data = await chrome.storage.local.get(BODY_STORAGE_KEY);
    const bodies = data[BODY_STORAGE_KEY] ?? {};
    return bodies[cacheKey] ?? null;
  } catch (error) {
    console.warn("[claude-i18n] storage.local body read failed", {
      cacheKey,
      error,
    });
    return null;
  }
}

async function writeStoragePayload(cacheKey, payload) {
  try {
    const data = await chrome.storage.local.get(BODY_STORAGE_KEY);
    const bodies = data[BODY_STORAGE_KEY] ?? {};
    bodies[cacheKey] = payload;
    await chrome.storage.local.set({
      [BODY_STORAGE_KEY]: bodies,
    });
  } catch (error) {
    console.warn("[claude-i18n] storage.local body write failed", {
      cacheKey,
      error,
    });
  }
}

async function responseToPayload(response) {
  const headers = {};
  for (const [key, value] of response.headers.entries()) {
    headers[key] = value;
  }

  return {
    status: response.status,
    headers,
    body: await response.text(),
  };
}
