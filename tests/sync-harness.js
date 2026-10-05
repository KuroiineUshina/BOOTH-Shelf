import { readFile } from "node:fs/promises";
import vm from "node:vm";
import * as urls from "../src/urls.js";
import * as i18n from "../src/i18n.js";
import * as search from "../src/search.js";

// Virtual network/storage latency: exercise the production scheduler without
// issuing BOOTH requests or making the test suite wait for real retry timers.
export class SyncClock {
  time = 0;
  epoch = Date.parse("2026-09-08T00:00:00.000Z");
  timers = [];
  sequence = 0;

  setTimeout = (callback, delay = 0) => {
    const timer = { at: this.time + Math.max(0, delay), callback, id: ++this.sequence };
    this.timers.push(timer);
    return timer.id;
  };

  sleep(delay) { return new Promise((resolve) => this.setTimeout(resolve, delay)); }

  async settle(promise, limit = 300_000) {
    let done = false;
    let result;
    let failed = false;
    let failure;
    promise.then((value) => { result = value; done = true; }, (error) => {
      failed = true;
      failure = error;
      done = true;
    });
    const deadline = this.time + limit;
    while (!done) {
      // A real event-loop turn drains all promise continuations before advancing
      // the virtual clock, including checkpoint writes and retry scheduling.
      await new Promise(setImmediate);
      if (done) break;
      this.timers.sort((a, b) => a.at - b.at || a.id - b.id);
      const timer = this.timers.shift();
      if (!timer) throw new Error("Pending sync has no scheduled work (possible deadlock)");
      if (timer.at > deadline) throw new Error("Virtual sync exceeded its deadline");
      this.time = timer.at;
      timer.callback();
    }
    if (failed) throw failure;
    return result;
  }
}

function fixtureNode(text) {
  return {
    textContent: text,
    cloneNode() { return fixtureNode(text); },
    querySelectorAll() { return []; },
    getAttribute(name) { return name === "content" ? text : null; },
  };
}

export async function createSyncHarness({
  source = new URL("../src/booth.js", import.meta.url),
  products = {},
  libraryPages = {},
  latency = 1200,
} = {}) {
  const clock = new SyncClock();
  const requests = [];
  let active = 0;
  let maxActive = 0;
  let parses = 0;
  const ClockDate = class extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.epoch + clock.time])); }
    static now() { return clock.epoch + clock.time; }
  };
  const context = {
    ...urls, ...i18n, ...search,
    URL, URLSearchParams,
    Date: ClockDate,
    setTimeout: clock.setTimeout,
    JSON: {
      stringify: JSON.stringify,
      parse(text) {
        parses += 1;
        return JSON.parse(text);
      },
    },
    DOMParser: class {
      parseFromString(html) {
        parses += 1;
        const data = JSON.parse(html);
        return {
          querySelector(selector) {
            if (selector === ".js-market-item-detail-description") {
              return data.description ? fixtureNode(data.description) : null;
            }
            if (["h1", "title", 'meta[property="og:title"]', 'meta[name="twitter:title"]'].includes(selector)) {
              return data.title ? fixtureNode(data.title) : null;
            }
            return null;
          },
          querySelectorAll() { return []; },
        };
      }
    },
    fetch: async (url, options) => {
      const address = new URL(url);
      const productId = address.pathname.match(/\/items\/(\d+)/)?.[1];
      const supplied = productId ? products[productId] : libraryPages[address.pathname + address.search];
      const attempt = requests.filter((entry) => entry.url === url).length;
      const fixture = typeof supplied === "function" ? supplied(attempt) : supplied;
      if (!fixture) throw new Error(`Missing request fixture: ${url}`);
      const request = { url, productId, start: clock.time, credentials: options.credentials };
      requests.push(request);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await clock.sleep(fixture.latency ?? latency);
      active -= 1;
      request.end = clock.time;
      return {
        url: fixture.redirect ?? url,
        status: fixture.status ?? 200,
        ok: !fixture.status || fixture.status < 400,
        headers: { get: (name) => name === "Retry-After" ? fixture.retryAfter ?? null : null },
        text: async () => {
          // Product JSON endpoint: answer in BOOTH's item JSON shape.
          if (address.pathname.endsWith(".json")) {
            if (fixture.invalidJson) return "<!doctype html>";
            return JSON.stringify({
              id: Number(productId),
              name: fixture.title ?? "",
              description: fixture.description ?? "",
              shop: { name: "" },
            });
          }
          return JSON.stringify(fixture);
        },
      };
    },
  };
  const sourceText = (await readFile(source, "utf8"))
    .replace(/^import\s+[\s\S]*?from\s+"[^"]+";\r?\n/gm, "")
    .replace(/^export\s+/gm, "");
  // Library HTML parsing has separate browser fixtures. Here only network
  // scheduling, ordering, grouping and failure propagation are under test.
  const api = vm.runInNewContext(`${sourceText}
    parseBoothLibraryPage = (html, {source, page, pageUrl}) => {
      const fixture = JSON.parse(html);
      return {pageCount: fixture.pageCount ?? 1, items: (fixture.items ?? []).map((item, orderOnPage) => ({
        ...item, source, page, sourcePageUrl: pageUrl, orderOnPage,
      }))};
    };
    ({ indexBoothProductSupport, syncBoothLibrary, PRODUCT_SUPPORT_INDEX_VERSION });
  `, context, { filename: String(source) });
  return { api, clock, requests, metrics: () => ({ active, maxActive, parses }) };
}

export function makeSupportItems(count, { links = false } = {}) {
  const items = Array.from({ length: count }, (_, index) => ({
    key: `product:${900000001 + index}`,
    productId: String(900000001 + index),
    title: `Test product ${index + 1}`,
  }));
  const products = Object.fromEntries(items.map((item, index) => [item.productId, {
    title: index % 2 ? "Shinra" : "Misaki",
    description: links
      ? `Supported avatars\nhttps://booth.pm/ja/items/${items[(index + 1) % items.length].productId}`
      : "Supported avatars\nMisaki",
  }]));
  return { items, products };
}
