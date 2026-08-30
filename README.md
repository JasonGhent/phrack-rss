# phrack-rss

An unofficial RSS 2.0 feed for [Phrack Magazine](https://archives.phrack.org/issues/),
which has no official feed. One item per issue, published via GitHub Pages.

## Output

- Feed: `https://<owner>.github.io/phrack-rss/phrack.xml`
- Index: `https://<owner>.github.io/phrack-rss/`

Item titles are `Phrack Issue N`, linking to `https://archives.phrack.org/issues/N/`.

## How it works

`src/build.mjs` (Node) fetches the archive's issue index with a browser User-Agent,
extracts the issue numbers, and emits a clean RSS 2.0 document (one `<item>` per
issue, stable `guid`) into `public/`. The archive answers a plain request directly,
so it's a single fetch path with a couple of retries.

`.github/workflows/build.yml` runs it daily on a GitHub-hosted runner and deploys
`public/` to GitHub Pages. `rerun.yml` retries a failed run once on a fresh runner IP.

### A note on dates

The Phrack archive exposes **no publication dates** (the directory listing has empty
date columns, and `phrack.org` renders client-side). So `pubDate` is synthesized: the
newest issue is dated at build time and older issues step back from it. This keeps the
feed correctly ordered and guarantees a newly-published issue surfaces in readers
(dated ~now, clearing any max-age filter). Item identity is the stable `guid`
(`phrack:issue:N`), so issues are never re-surfaced as unread just because the
synthetic dates drift between builds. The dates are **not** the true historical
publication dates.

## Setup

1. Create the GitHub repo and push this directory.
2. Repo **Settings → Pages → Source: GitHub Actions**.
3. Run the **Build & publish Phrack RSS** workflow once (Actions tab → Run workflow),
   or wait for the daily cron.
4. Subscribe your reader to `https://<owner>.github.io/phrack-rss/phrack.xml`.

## Local run

```bash
npm run build          # writes public/phrack.xml
```
