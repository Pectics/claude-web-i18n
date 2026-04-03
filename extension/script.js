const CUSTOM_LANGUAGE_ID = "zh-CN-custom";
const CUSTOM_LOCALE = "zh-CN";
const EXTENSION_LOCALES = new Set([CUSTOM_LOCALE]);
const OVERRIDE_STORAGE_KEY = "claude-i18n:locale";
const PAGE_HOOK_SCRIPT_ID = "claude-i18n-page-hook";
const MENU_STYLE_ID = "claude-i18n-menu-style";
const PAGE_REQUEST_SOURCE = "claude-i18n-page";
const PAGE_RESPONSE_SOURCE = "claude-i18n-extension";
const PAGE_HOOK_TIMEOUT_MS = 1500;

let pageRequestCounter = 0;

injectPageHook();
injectMenuStyle();
registerPageHookBridge();
startMenuObserver();

function injectPageHook() {
  if (document.getElementById(PAGE_HOOK_SCRIPT_ID)) {
    return;
  }

  const script = document.createElement("script");
  script.id = PAGE_HOOK_SCRIPT_ID;
  script.src = chrome.runtime.getURL("hook.js");
  script.async = false;
  (document.head ?? document.documentElement).append(script);
}

function injectMenuStyle() {
  if (document.getElementById(MENU_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = MENU_STYLE_ID;
  style.textContent = `
    [data-claude-i18n-mode="extension"] > [lang]:not([data-custom-language="true"]) > :nth-child(2) {
      visibility: hidden;
    }
  `;
  (document.head ?? document.documentElement).append(style);
}

function registerPageHookBridge() {
  window.addEventListener("message", async (event) => {
    if (event.source !== window) {
      return;
    }

    const data = event.data;
    if (!data || data.source !== PAGE_REQUEST_SOURCE) {
      return;
    }

    if (data.type === "claude-i18n-runtime-status") {
      console.log("[claude-i18n] runtime status", data.payload);
      return;
    }

    if (data.type !== "i18n-fetch") {
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: "i18n-fetch",
        requestId: data.requestId,
        locale: data.locale,
        url: data.url,
      });

      window.postMessage(
        {
          source: PAGE_RESPONSE_SOURCE,
          type: "i18n-fetch-response",
          requestId: data.requestId,
          ok: true,
          payload: response,
        },
        window.location.origin,
      );
    } catch (error) {
      window.postMessage(
        {
          source: PAGE_RESPONSE_SOURCE,
          type: "i18n-fetch-response",
          requestId: data.requestId,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        },
        window.location.origin,
      );
    }
  });
}

function requestPageHook(type, payload = {}) {
  return new Promise((resolve, reject) => {
    const requestId = `page-${Date.now()}-${pageRequestCounter++}`;
    const timeoutId = window.setTimeout(() => {
      window.removeEventListener("message", handleMessage);
      reject(new Error(`Timed out waiting for page hook response: ${type}`));
    }, PAGE_HOOK_TIMEOUT_MS);

    function handleMessage(event) {
      if (event.source !== window) {
        return;
      }

      const data = event.data;
      if (
        !data ||
        data.source !== PAGE_RESPONSE_SOURCE ||
        data.requestId !== requestId ||
        data.type !== "runtime-response"
      ) {
        return;
      }

      window.clearTimeout(timeoutId);
      window.removeEventListener("message", handleMessage);

      if (!data.ok) {
        reject(new Error(data.error || `Page hook request failed: ${type}`));
        return;
      }

      resolve(data.payload);
    }

    window.addEventListener("message", handleMessage);
    window.postMessage(
      {
        source: PAGE_RESPONSE_SOURCE,
        type: "runtime-request",
        requestId,
        payload: {
          type,
          ...payload,
        },
      },
      window.location.origin,
    );
  });
}

function readOverrideLocale() {
  try {
    return window.localStorage.getItem(OVERRIDE_STORAGE_KEY);
  } catch (error) {
    console.warn("[claude-i18n] failed to read override locale", error);
    return null;
  }
}

function writeOverrideLocale(locale) {
  try {
    window.localStorage.setItem(OVERRIDE_STORAGE_KEY, locale);
  } catch (error) {
    console.warn("[claude-i18n] failed to write override locale", error);
  }
}

function clearOverrideLocale() {
  try {
    window.localStorage.removeItem(OVERRIDE_STORAGE_KEY);
  } catch (error) {
    console.warn("[claude-i18n] failed to clear override locale", error);
  }
}

function isExtensionLocale(locale) {
  return typeof locale === "string" && EXTENSION_LOCALES.has(locale);
}

function getRuntimeStatus() {
  return requestPageHook("status");
}

function applyLocaleOverride(locale) {
  return requestPageHook("set-locale-override", {
    locale: locale ?? null,
  });
}

function clearLocaleOverride() {
  return requestPageHook("clear-locale-override");
}

function isElement(value) {
  return value instanceof Element;
}

function getMenuWrapper(node) {
  if (!isElement(node)) {
    return null;
  }

  return node.matches("[data-radix-popper-content-wrapper]") ? node : null;
}

function getMenuElement(wrapper) {
  if (!isElement(wrapper)) {
    return null;
  }

  return wrapper.querySelector('[data-radix-menu-content][role="menu"]');
}

function getMenuItems(menu) {
  if (!isElement(menu)) {
    return [];
  }

  return Array.from(
    menu.querySelectorAll(':scope > [role="menuitem"], :scope > [data-radix-collection-item]'),
  ).filter(isElement);
}

function getMenuTrigger(menu) {
  if (!isElement(menu)) {
    return null;
  }

  const triggerId = menu.getAttribute("aria-labelledby");
  if (!triggerId) {
    return null;
  }

  const trigger = document.getElementById(triggerId);
  return isElement(trigger) ? trigger : null;
}

function isLanguageTrigger(trigger, menu) {
  if (!isElement(trigger) || !isElement(menu)) {
    return false;
  }

  if (trigger.getAttribute("aria-haspopup") !== "menu") {
    return false;
  }

  return trigger.getAttribute("aria-controls") === menu.id;
}

function looksLikeLanguageMenu(menu) {
  const trigger = getMenuTrigger(menu);
  if (!isLanguageTrigger(trigger, menu)) {
    return false;
  }

  const items = getMenuItems(menu);
  if (items.length < 5) {
    return false;
  }

  return items.every((item) => item.hasAttribute("lang"));
}

function getLabelContainer(item) {
  if (!isElement(item)) {
    return null;
  }

  const firstChild = item.firstElementChild;
  return isElement(firstChild) ? firstChild : null;
}

function getIndicatorContainer(item) {
  if (!isElement(item)) {
    return null;
  }

  const children = Array.from(item.children).filter(isElement);
  return children.length >= 2 ? children[1] : null;
}

function ensureIndicatorPlaceholder(item) {
  const indicator = getIndicatorContainer(item);
  if (!isElement(indicator)) {
    return null;
  }

  if (indicator.tagName === "DIV") {
    return indicator;
  }

  const placeholder = document.createElement("div");
  placeholder.className = "h-4 w-4";
  indicator.replaceWith(placeholder);
  return placeholder;
}

function getUnselectedTemplateItem(items) {
  return (
    items.find((item) => {
      const indicator = getIndicatorContainer(item);
      return (
        isElement(indicator) &&
        indicator.tagName === "DIV" &&
        indicator.classList.contains("h-4") &&
        indicator.classList.contains("w-4")
      );
    }) ?? items[0]
  );
}

function getItemText(item) {
  return item.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function getItemLocale(item) {
  if (!isElement(item)) {
    return null;
  }

  return item.getAttribute("lang");
}

function createCheckIcon() {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  icon.setAttribute("width", "16");
  icon.setAttribute("height", "16");
  icon.setAttribute("fill", "currentColor");
  icon.setAttribute("viewBox", "0 0 256 256");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    "M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z",
  );

  icon.append(path);
  return icon;
}

function updateSelectionIndicator(item, isSelected) {
  if (!isElement(item)) {
    return;
  }

  const indicator = ensureIndicatorPlaceholder(item);
  if (!isElement(indicator)) {
    return;
  }

  indicator.className = "h-4 w-4";
  indicator.replaceChildren();

  if (isSelected) {
    indicator.append(createCheckIcon());
    item.setAttribute("aria-checked", "true");
    return;
  }

  item.removeAttribute("aria-checked");
}

function updateItemLabel(item, label) {
  const labelContainer = getLabelContainer(item);
  if (!isElement(labelContainer)) {
    return;
  }

  labelContainer.textContent = label;
}

function attachHoverBehavior(item) {
  if (!isElement(item)) {
    return;
  }

  item.addEventListener("pointermove", () => {
    item.setAttribute("data-highlighted", "");
  });

  item.addEventListener("pointerleave", () => {
    item.removeAttribute("data-highlighted");
  });
}

function normalizeCustomItem(item) {
  if (!isElement(item)) {
    return;
  }

  item.setAttribute("lang", CUSTOM_LOCALE);
  item.setAttribute("tabindex", "-1");
  item.setAttribute("aria-label", "Simplified Chinese");
  item.removeAttribute("data-highlighted");
  item.removeAttribute("aria-checked");
  updateSelectionIndicator(item, false);
}

function getOfficialLanguageItems(menu) {
  return getMenuItems(menu).filter(
    (item) => item.getAttribute("data-custom-language-id") !== CUSTOM_LANGUAGE_ID,
  );
}

function getDesiredLocale() {
  return readOverrideLocale();
}

function syncMenuSelection(menu) {
  const desiredLocale = getDesiredLocale();
  menu.dataset.claudeI18nMode = isExtensionLocale(desiredLocale) ? "extension" : "official";

  const customItem = menu.querySelector(
    `[data-custom-language-id="${CUSTOM_LANGUAGE_ID}"]`,
  );
  if (isElement(customItem)) {
    updateSelectionIndicator(customItem, getItemLocale(customItem) === desiredLocale);
  }
}

function stopEvent(event) {
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") {
    event.stopImmediatePropagation();
  }
}

function closeLanguageMenu(menu) {
  if (!isElement(menu)) {
    return;
  }

  const escapeEvent = new KeyboardEvent("keydown", {
    key: "Escape",
    code: "Escape",
    keyCode: 27,
    which: 27,
    bubbles: true,
  });

  menu.dispatchEvent(escapeEvent);
  document.dispatchEvent(escapeEvent);
}

function fallbackToReload(locale) {
  if (locale) {
    writeOverrideLocale(locale);
  } else {
    clearOverrideLocale();
  }

  window.location.reload();
}

function handleOfficialLanguageSelection(item) {
  const targetLocale = getItemLocale(item);
  if (!targetLocale) {
    return;
  }

  if (isExtensionLocale(readOverrideLocale())) {
    clearOverrideLocale();
    clearLocaleOverride().catch((error) => {
      console.warn("[claude-i18n] failed to clear runtime locale override", error);
      fallbackToReload(null);
    });
  }

  writeOverrideLocale(targetLocale);
}

function attachOfficialLanguageHandlers(menu) {
  const items = getOfficialLanguageItems(menu);
  for (const item of items) {
    if (item.dataset.claudeI18nBound === "1") {
      continue;
    }

    item.dataset.claudeI18nBound = "1";
    item.addEventListener(
      "click",
      () => {
        handleOfficialLanguageSelection(item);
      },
      { capture: true },
    );
  }
}

function buildCustomLanguageItem(menu) {
  const items = getMenuItems(menu);
  const templateItem = getUnselectedTemplateItem(items);
  if (!isElement(templateItem)) {
    return null;
  }

  const customItem = templateItem.cloneNode(true);
  if (!isElement(customItem)) {
    return null;
  }

  customItem.setAttribute("data-custom-language-id", CUSTOM_LANGUAGE_ID);
  customItem.setAttribute("data-custom-language", "true");

  normalizeCustomItem(customItem);
  attachHoverBehavior(customItem);
  updateItemLabel(customItem, "简体中文 (中国大陆)");

  customItem.addEventListener(
    "click",
    (event) => {
      stopEvent(event);

      if (getDesiredLocale() === CUSTOM_LOCALE) {
        return;
      }

      writeOverrideLocale(CUSTOM_LOCALE);
      syncMenuSelection(menu);

      applyLocaleOverride(CUSTOM_LOCALE)
        .then(() => {
          closeLanguageMenu(menu);
        })
        .catch((error) => {
          console.warn("[claude-i18n] failed to apply runtime locale override", error);
          fallbackToReload(CUSTOM_LOCALE);
        });
    },
    { capture: true },
  );

  return customItem;
}

function injectCustomLanguage(menu) {
  if (!isElement(menu)) {
    return;
  }

  attachOfficialLanguageHandlers(menu);

  let customItem = menu.querySelector(
    `[data-custom-language-id="${CUSTOM_LANGUAGE_ID}"]`,
  );

  if (!isElement(customItem)) {
    customItem = buildCustomLanguageItem(menu);
    if (!isElement(customItem)) {
      return;
    }

    menu.append(customItem);
    console.log("[claude-i18n] injected custom language item");
  }

  syncMenuSelection(menu);
}

function handleNewWrapper(node) {
  const wrapper = getMenuWrapper(node);
  if (!wrapper) {
    return;
  }

  const menu = getMenuElement(wrapper);
  if (!isElement(menu) || !looksLikeLanguageMenu(menu)) {
    return;
  }

  injectCustomLanguage(menu);
}

function startMenuObserver() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        handleNewWrapper(node);
      }
    }
  });

  const target = document.body ?? document.documentElement;
  if (!target) {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        startMenuObserver();
      },
      { once: true },
    );
    return;
  }

  observer.observe(target, {
    childList: true,
    subtree: target === document.documentElement,
  });

  getRuntimeStatus().catch(() => {});
  console.log("[claude-i18n] menu observer started");
}
