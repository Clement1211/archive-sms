import english from "./locales/en.js";
import french from "./locales/fr.js";

const LOCALE_STORAGE_KEY = "archives-sms-language";
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const languages = [
  { code: "fr", name: "Français", intlLocale: "fr-FR", messages: french },
  { code: "en", name: "English", intlLocale: "en-GB", messages: english }
];
const catalogs = Object.fromEntries(languages.map(language => [language.code, language.messages]));
const intlLocales = Object.fromEntries(languages.map(language => [language.code, language.intlLocale]));
let currentLocale = "fr";

function readStoredLocale() {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (hasOwn(catalogs, saved)) return saved;
  } catch {
    // Storage may be unavailable in private browsing; the in-memory locale still works.
  }

  return typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("en") ? "en" : "fr";
}

function getMessage(key) {
  return catalogs[currentLocale][key] ?? french[key] ?? key;
}

export function t(key, values = {}) {
  return getMessage(key).replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name] ?? `{{${name}}}`));
}

export function tPlural(key, count, values = {}) {
  const category = new Intl.PluralRules(getIntlLocale()).select(count);
  const categoryKey = `${key}.${category}`;
  const fallbackKey = `${key}.other`;
  const currentCatalog = catalogs[currentLocale];
  const messageKey = hasOwn(currentCatalog, categoryKey)
    ? categoryKey
    : hasOwn(currentCatalog, fallbackKey)
      ? fallbackKey
      : hasOwn(french, categoryKey)
        ? categoryKey
        : fallbackKey;
  return t(messageKey, { ...values, count });
}

export function getAvailableLanguages() {
  return languages.map(({ code, name }) => ({ code, name }));
}

export function getLanguage() {
  return currentLocale;
}

export function getIntlLocale() {
  return intlLocales[currentLocale] || intlLocales.fr;
}

export function setLanguage(locale) {
  if (!hasOwn(catalogs, locale) || locale === currentLocale) return;
  currentLocale = locale;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // The choice applies for this session even when persistence is unavailable.
  }
  if (typeof document !== "undefined") {
    translatePage();
    document.dispatchEvent(new CustomEvent("archive:languagechange", { detail: { locale } }));
  }
}

export function translatePage(root = typeof document === "undefined" ? null : document) {
  if (typeof document === "undefined") return;
  if (!root) return;
  const page = root === document ? document : root;
  page.querySelectorAll("[data-i18n]").forEach(element => {
    element.textContent = t(element.dataset.i18n);
  });
  page.querySelectorAll("[data-i18n-html]").forEach(element => {
    // Only application-owned strings in the locale catalogs may use this attribute.
    element.innerHTML = t(element.dataset.i18nHtml);
  });
  page.querySelectorAll("[data-i18n-placeholder]").forEach(element => {
    element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder));
  });
  page.querySelectorAll("[data-i18n-aria-label]").forEach(element => {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
  });
  page.querySelectorAll("[data-i18n-title]").forEach(element => {
    element.setAttribute("title", t(element.dataset.i18nTitle));
  });
  page.querySelectorAll("[data-i18n-content]").forEach(element => {
    element.setAttribute("content", t(element.dataset.i18nContent));
  });

  if (page === document) {
    document.documentElement.lang = currentLocale;
    document.title = t("meta.title");
    document.querySelector('meta[name="description"]')?.setAttribute("content", t("meta.description"));
  }
}

currentLocale = readStoredLocale();
if (typeof document !== "undefined") translatePage();
