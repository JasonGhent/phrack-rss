// Scrape the Phrack archives issue index (https://archives.phrack.org/issues/) and
// publish a clean RSS 2.0 feed with one item per issue, written to public/phrack.xml
// + index.html. Phrack has no official feed and the archive exposes no publication
// dates, so pubDates are synthesized to be stable and correctly ordered (see below).
import { writeFile, mkdir } from "node:fs/promises";

const INDEX = process.env.PHRACK_INDEX_URL ?? "https://archives.phrack.org/issues/";
const ISSUE_BASE = process.env.PHRACK_ISSUE_BASE ?? "https://archives.phrack.org/issues/";
const SELF = process.env.FEED_SELF_URL ?? ""; // public URL of the published feed, for <atom:self>
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

// Synthetic pubDate spacing. The archive carries no real dates, so we date the
// newest issue at build time and step older issues back by STEP each. This keeps
// ordering correct and guarantees a freshly-published issue surfaces in readers
// (dated ~now, so it clears any max-age filter). Item identity is the stable guid,
// so readers don't re-surface issues just because these dates drift between builds.
const STEP_MS = 30 * 24 * 60 * 60 * 1000;

const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const esc = (s) => xml(s).replace(/"/g, "&quot;");
const cdata = (h) => `<![CDATA[${String(h).replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;

// True when the response isn't the issue index (e.g. a Cloudflare interstitial).
function notAnIndex(t) {
  return !/href=["']\/?issues\/\d+\/?["']/i.test(t);
}

// The archive answers a plain browser-UA request directly (no WAF/fingerprint gate),
// so a single fetch path with a couple of retries is enough.
async function fetchOnce() {
  const resp = await fetch(INDEX, { headers: { "User-Agent": UA, Accept: "text/html" } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const text = await resp.text();
  if (notAnIndex(text)) throw new Error("response was not the issue index");
  return text;
}

async function fetchIndex() {
  const tries = 3;
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fetchOnce();
    } catch (e) {
      last = e.message;
      console.warn(`fetch attempt ${i + 1}/${tries} failed: ${last}`);
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw new Error(`Phrack index fetch failed after ${tries} attempts: ${last}`);
}

function parseIssues(html) {
  const seen = new Set();
  for (const m of html.matchAll(/href=["']\/?issues\/(\d+)\/?["']/gi)) {
    seen.add(Number(m[1]));
  }
  // Descending: newest issue first.
  return [...seen].sort((a, b) => b - a);
}

function buildFeed(issues) {
  const now = new Date();
  const maxN = issues.length ? Math.max(...issues) : 0;
  const items = issues.map((n) => {
    const date = new Date(now.getTime() - (maxN - n) * STEP_MS);
    const link = `${ISSUE_BASE}${n}/`;
    return {
      n,
      id: `phrack:issue:${n}`,
      title: `Phrack Issue ${n}`,
      link,
      date,
      body: `<p>Phrack Magazine, Issue #${n}.</p>\n<p><a href="${esc(link)}">Read issue ${n} &raquo;</a></p>`,
    };
  });

  const itemXml = items
    .map((it) =>
      [
        "    <item>",
        `      <title>${xml(it.title)}</title>`,
        `      <link>${xml(it.link)}</link>`,
        `      <guid isPermaLink="false">${xml(it.id)}</guid>`,
        `      <pubDate>${it.date.toUTCString()}</pubDate>`,
        `      <description>${cdata(it.body)}</description>`,
        "    </item>",
      ].join("\n"),
    )
    .join("\n");

  const nowStr = now.toUTCString();
  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Phrack Magazine</title>
    <link>https://archives.phrack.org/issues/</link>
${SELF ? `    <atom:link href="${xml(SELF)}" rel="self" type="application/rss+xml" />\n` : ""}    <description>New Phrack Magazine issues, as an RSS feed (unofficial mirror of the Phrack archive).</description>
    <language>en-us</language>
    <generator>phrack-rss</generator>
    <lastBuildDate>${nowStr}</lastBuildDate>
${itemXml}
  </channel>
</rss>
`;
  return { feed, count: items.length, now: nowStr, maxN };
}

const html = await fetchIndex();
const issues = parseIssues(html);
if (!issues.length) throw new Error("parsed 0 issues from the index — refusing to publish an empty feed");
const { feed, count, now, maxN } = buildFeed(issues);
await mkdir("public", { recursive: true });
await writeFile("public/phrack.xml", feed, "utf8");
await writeFile(
  "public/index.html",
  `<!doctype html><meta charset="utf-8"><title>phrack-rss</title>
<body style="font:15px/1.5 system-ui,sans-serif;max-width:700px;margin:3rem auto;padding:0 1rem">
<h1>phrack-rss</h1>
<p>An unofficial RSS 2.0 feed for <a href="https://archives.phrack.org/issues/">Phrack Magazine</a>, one item per issue.</p>
<p>Feed: <a href="./phrack.xml">phrack.xml</a> — ${count} issues (latest: #${maxN}), updated ${now}.</p>
</body>`,
  "utf8",
);
console.log(`Wrote public/phrack.xml (${count} issues, latest #${maxN})`);
