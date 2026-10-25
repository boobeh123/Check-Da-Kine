# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Check Da Kine (https://checkdakine.com) tracks arrests by the Honolulu Police Department (HPD) using data HPD publishes, and on the Big Island by the Hawaiʻi Police Department, from its booking logs. It's a JavaScript rebuild of Tyliec's Python project HPD Stats (https://github.com/hnl-ai/hpdstats), which the footer and README credit. Comments that cite `scrape/main.py` or `scrape/utils/*.py` mean files in that project.

The repo deploys as four Railway services:

| Service | Command | Schedule |
|---|---|---|
| The website (Express 5, EJS, MongoDB) | `npm start` | always on |
| Arrest logs: download HPD's PDFs (Oʻahu, read with OCR) and the Hawaiʻi Police Department's booking logs (the Big Island, read from their text), archive them to Cloudinary, save the arrests | `npm run scrape` | hourly at :40 |
| Dispatch calls: save HPD's open calls and place them on the map | `npm run scrape-dispatches` | every 10 minutes |
| News: HPD's latest releases from its WordPress API, and its posts on X | `npm run scrape-news` | hourly |

There's no railway.json or nixpacks.toml: start commands, schedules and variables are set in Railway's dashboard. Each job prints a summary and exits. A non-zero exit code marks the run as failed in Railway's cron history, so new jobs should do the same.

README.md explains the pipeline in detail for people reading the GitHub page. Update it when behavior it describes changes.

Work on a branch and open a pull request to `main`, one at a time: start the next branch from an up-to-date `main` after the previous pull request merges. Don't push to `main`.

## Commands

```bash
npm run dev                                                # node --watch server.js
npm start
npm test                                                   # every test; no database or network needed
node --test test/validation.test.js                        # one file
node --test --test-name-pattern="toHref" test/*.test.js    # tests whose name matches
npm run parse -- path/to/Arrest_Log.pdf                    # OCR a local PDF into JSON beside it; no database
npm run scrape -- --limit 2 --skip-upload                  # import each island's 2 newest logs without archiving them
npm run scrape -- --island big-island --skip-upload        # just the Big Island (seconds; Oʻahu's OCR takes minutes per log)
npm run reparse                                            # re-read every stored log, replace all arrest records
npm run create-user -- --email someone@example.com         # invite-only login, password printed once; --reset for a new one
```

- No linter or formatter is set up. Match the style of the file you're editing.
- Node is pinned exactly in `engines`: 24.22.1, the Oct 21 2026 security release. pdfjs-dist 6 needs 22.13 or newer anyway.
  - Railway's builder must be Railpack, a setting in its dashboard, for every service built from this repo. Nixpacks only honours the major version.
  - Bump the pin for each Node security release, never back to a range. `test/requestBodies.test.js` fails on a range.
  - The server's startup line prints the running version.
- Copy `.env.example` to `.env` in the repo root. The server won't start without `SESSION_SECRET`. `npm run scrape` needs the three Cloudinary variables unless it's given `--skip-upload`. The website and `npm run reparse` need `CLOUDINARY_CLOUD_NAME` and `CLOUDINARY_API_SECRET` to sign links to the private archive: without them, logged-in users get HPD's link instead, and reparse can't read logs HPD no longer lists. `scrape-news` reads X only when `X_BEARER_TOKEN` is set, since X bills per post read. On Railway, `NODE_ENV=production` turns on secure cookies and the CSP's `upgrade-insecure-requests`.
- The scrapers and `reparse` write to whatever `DB_STRING` points at, and `reparse` replaces every arrest record. Don't run them against the production database unless Bobby asks.
- The first OCR run downloads Tesseract's English model from the jsDelivr CDN into `tessdataCache/` (gitignored).
- npm 11 may warn that bcrypt's and tesseract.js's install scripts weren't run. Both work without them; bcrypt loads its bundled prebuilt binary.
- `test/ocrRegression.test.js` re-reads the PDFs in `samplePdfs/` and compares every field with the JSON that `npm run parse` saved beside each one. The folder is gitignored because the logs hold real names, so on a fresh clone the test reports itself skipped. Run it with the samples present after changing the OCR pipeline. A failure names the arrest and field, never the values.

## Architecture

Requests go `routes/` → `middleware/` (validators, the login rate limiter) → `controller/` → `services/` → `model/`, and render `views/*.ejs`. Controllers are thin: queries and data shaping live in `services/`, which the jobs in `jobs/` share.

**server.js** follows the order in Bobby's standards: dotenv, `trust proxy`, helmet, morgan, body parsers (both with `inflate: false`, so a compressed request body gets a 415; no browser sends one, and decompressing it reached the Brotli bug fixed in the Oct 2026 Node security release), static files, sessions (connect-mongo on Mongoose's client), Passport, flash and locals, routes, 404, error handler. It listens only after MongoDB connects.
- `trust proxy` is 1 because the site is served straight from Railway's edge. If a CDN is ever put in front, add a hop, or the login rate limiter will count the CDN's address instead of each visitor's.
- The CSP's `img-src` lists each outside image host: Cloudinary, OpenStreetMap's tiles, honolulupd.org and pbs.twimg.com. `script-src` is helmet's default `'self'`; Leaflet is served from `node_modules/leaflet/dist` at `/vendor/leaflet`.
- A visitor has no session, and no cookie, until something is saved to it (a login, or a flash message). `saveUninitialized` is false, and reading a flash type never writes to the session.
- `req.flash()` comes from `middleware/flash.js`, which replaced connect-flash (last released in 2013; it calls Node's deprecated `util.isArray`, and it wrote to the session on every read). It keeps the two calls the app makes: `req.flash(type, message)` queues a message or each item of a list, and `req.flash(type)` returns that type's messages and clears them. It looks up `req.session` on every call, because Passport replaces the session at login and logout.
- Visitors don't get sessions, which is why the home, Arrests, and Dispatches pages don't flash and redirect on a bad query string: they show the message on the page with a 400 status and fall back to the defaults.

**Input.**
- Every field starts with `.isString()`, and controllers read input with `matchedData(req)`. In Express 5, `req.query` is a getter that re-parses the URL, so sanitizers like `.trim()` never change it; only `matchedData` has the cleaned values.
- Login is the exception: Passport reads `req.body` itself, and `validateLogin` cleans it in place (`req.body` is writable).
- When flashing validation errors, keep only `{ msg }`: `errors.array().map(({ msg }) => ({ msg }))`. The full error objects carry the submitted value, so a rejected password would be saved in the session store.

**MongoDB guard.** `config/database.js` turns on Mongoose's `sanitizeFilter`, which neutralizes `$` operators in query filters. Wrap every operator the app writes in a query in `mongoose.trusted()`, as listArrests.js and geocodePlaces.js do. A missing wrapper either silently matches nothing or throws a CastError, depending on the field. Aggregation pipelines aren't sanitized, so their `$match` stages need no wrapper.

**Islands.** Each island the site covers is one entry in `services/agencies.js`: its log and record models, the paths of its stats and arrests pages, its Cloudinary folder, `staleAfterHours`, whether HPD's news and X posts show (`hasNews`), and every word that differs between the islands' pages (`copy`).
- Oʻahu keeps `/` and `/arrests`. The Big Island's pages are `/big-island` and `/big-island/arrests` (`routes/bigIslandRoutes.js`). Dispatches are Oʻahu's only.
- `useAgency(key)` (`middleware/agency.js`) sets `req.agency` in front of the same validators and controllers. Controllers read `req.agency ?? agencies.oahu`, and `getDashboard`, `listArrests` and `getFilterOptions` take an `agency` that defaults to Oʻahu, so Oʻahu's routes need no wiring.
- Views take their words from `agency.copy`, and their links and form actions from `agency.paths`. `partials/islandSwitch.ejs` puts the Oʻahu | Big Island links at the top of both pages. `arrestFeed.js` takes the feed's address from the search form's `action`.
- The nav's Home and Arrests links follow the island on screen. `app.locals.agency` (server.js) is Oʻahu, so every page has an island, even an error page rendered before the middleware runs, and island pages pass their own.
- `test/agencies.test.js` fails when an island is missing a word the others have, so a new island can't leave part of a page blank.
- Adding an island takes: a log model and a record model on the shared schemas, an importer with its step in `jobs/scrapeArrestLogs.js`, an entry in agencies.js, a routes file mounted in server.js, any new race or ethnicity values in `ethnicityGroups.js`, and a credit in `partials/footer.ejs`.

**Who sees names.** Arrestee and officer names, and Big Island hometowns, appear only for logged-in users. Accounts are invite-only: there's no signup route, only `npm run create-user`.
- `name` and `residence` (a Big Island arrestee's town) are `select: false`. `listArrests` adds `+name +residence` only when `showNames` is true, and leaves out `offenses.officer` otherwise.
- The officer dropdown is built only for logged-in users, and `resolveFilters` drops a guest's officer filter on the server, so guests can't tie an officer to arrests through the filters.
- The search's text index (`arrestSearch`) covers charge, statute, location and report number, never names. The dashboard sends counts only.
- Guests never get a link to an arrest log, because its PDF prints every name: `toCard` sets a card's `source` only for logged-in users. Our copies on Cloudinary are private, so nobody can download one by guessing its address: `archiveLink` (archivePdf.js) signs each link.
- Pages that show names send `Cache-Control: private, no-store`.

Anything new that reads arrests should follow the same rules. `test/arrestCards.test.js` checks what a guest's card contains.

**Arrest logs** (`services/arrestLog/`). HPD posts a log about every 6 hours, each covering 12 hours, so most arrests appear in two logs.
- `importArrestLogs` takes each listed log that isn't `parsed` yet, oldest first: download into memory, archive a private copy to Cloudinary (`archivePdf`), OCR (`parseArrestLog`), then save each arrest (`saveRecord`). A failed log is marked `failed` and retried on the next run, while HPD still lists it (about two weeks).
- A copy's `pdfUrl` says how Cloudinary delivers it: `/raw/upload/` is public and `/raw/authenticated/` is private. Copies uploaded before the archive went private (Oct 2026) are moved by `makeArchivePrivate`, which `npm run scrape` runs after every import. Each moved copy has to download through a signed link before its new URL is saved, or it's moved back.
- `parseArrestLog`: pdf.js renders each page at 2x onto an @napi-rs/canvas. It's an ES module, so it's loaded with dynamic `import()`. The pages are cropped and stacked into one tall strip, and a scan down one pixel column finds where each arrest and each charge starts. Then sharp enlarges each field box and a single Tesseract worker reads them one at a time.
- `layoutConstants.js` holds pixel positions measured on HPD's PDFs at 2x (1584 px wide). If HPD changes its layout, these are what move. Check any change with `npm run parse` on new PDFs and the OCR regression test.
- `toRecordFields` leaves out a sex or age that didn't read cleanly instead of saving it wrong, and skips an arrest with no readable time or report number. `warnings` records why, and the card shows "Flagged for review".
- `dedupeKey` is the arrest time, the incident (the lowest report number without its `-NNN` suffix), the sex and the age. Names are left out on purpose: OCR noise in a name differs from log to log. `saveRecord` lets the newest log's version win, by `lastSeenAt`.
- After any change to parsing or to the key, run `npm run reparse`. It rebuilds into `arrestrecords_rebuild` and swaps that in with `$out`, which keeps the live collection's indexes. It changes nothing if a download fails or the scraper imports a log meanwhile.

**Big Island booking logs** (`services/bigIsland/`). The Hawaiʻi Police Department posts one "Media Booking Log" PDF each morning at https://www.hawaiipolice.gov/news-and-media/booking-logs/, covering about 48 hours, and lists only about 8 days of them. `npm run scrape` imports them after Oʻahu's logs, each island on its own; `--island` picks one.
- The PDFs are Crystal Reports output with a real text layer, so `services/pdfText.js` reads positioned text pieces with pdf.js. No OCR.
- `bookingLayout.js` holds the column positions. `parseBookingLog` groups the pieces into rows (across page breaks), starts a booking at a time in the Arrested On column and a charge at a report number, joins wrapped charge text, and drops "Released By", a name nothing uses.
- Every log prints its own totals ("Total OTNs Records Found", "Total Charge Records Found"). A charge mismatch, a booking whose row went unread, or no totals at all means the layout changed: the log is marked `failed` with nothing saved, and retried on the next run.
  - A booking counts as read when there are as many bookings as "Charges for OTN" lines, one per booking.
  - The department's booking total can be wrong. On Oct 25 2026 it listed 39 but printed 38, every one with its OTN line and charges. When every OTN line has its booking and the charges add up, a booking-total mismatch is a warning, not a failure.
- Odd rows the log itself prints (a charge above the first booking) and a miscounted booking total are warnings saved on the log.
- `toBookingFields` maps a booking onto the Oʻahu record shape. The arresting officer and release time are the booking's, copied onto each charge. A statute is split off the charge text ("291E-0061 OVUII" -> "HRS 291E-0061" and "OVUII"); a charge printed without one keeps its whole text and isn't flagged.
- `dedupeKey` is `otn:<OTN>`, the statewide Offense Tracking Number printed with each booking, so the overlapping logs merge exactly.
- Bookings go in their own collections, `BigIslandBookingLog` and `BigIslandArrest`, which reuse the Oʻahu schemas, so no Oʻahu page or count can include them. The schema's `ref: 'ArrestLog'` means populating a Big Island record's log needs `{ model: BigIslandBookingLog }`, which `listArrests` passes as `agency.Log`.
- `residence` (the arrestee's town; "Address of Arrestee" in the log) is `select: false` like `name`: in a small town, town, age and sex can point to one person. Logged-in users only.
- Copies are archived privately under `checkDaKine/bigIslandBookings/` (`archivePdf`'s `folder` option). Stored file names swap the printed name's spaces for dashes.
- When inspecting real logs, never print a person's name: mask every letter in the name, officer, released-by and hometown columns by position (x 180–345 and 480–670), not by matching "LAST, FIRST".
- Kauaʻi publishes a similar daily PDF, but its site answers scripts with a 403, so it isn't imported. Maui County publishes no arrest logs online.

**Dispatches** (`services/dispatches/`).
- HPD's page lists only open calls, despite its file name, and prints 24-hour times followed by a meaningless AM/PM.
- `saveDispatches` upserts each call by received time, type and address, and moves `lastSeenAt` forward with `$max`. "Active now" means the calls whose `lastSeenAt` equals the newest one.
- "Active now" and the map always show HPD's latest update. The history below them (the stat tiles and both charts) covers a date range from the date filter: all time by default.
- `geocodePlaces` follows Nominatim's usage policy: at most one request per second, a User-Agent naming checkdakine.com, and every result cached in `GeocodedPlace`, misses included. It makes at most 30 lookups per run, bounded to Oahu. HPD's masked house numbers are rebuilt first: `51XX` is the 5100 block, and `911200` is the zone-lot number 91-1200.

**News and X** (`services/news/`).
- Both sources are fetched before connecting to MongoDB, and a failure in one doesn't stop the other.
- The stored releases and posts mirror the latest 10 at each source: upsert them, then delete anything no longer listed, but never on an empty list. X's developer terms require a deleted post to disappear here too.
- Post text is shown whole and unaltered, with its links, @mentions and #hashtags linked, as X's display requirements ask.
- Links and image URLs are kept only from allowed hosts (`onHpdSite`, `onXImageHost`, `isWebLink`), the same hosts the CSP allows. A new image host needs both.
- X bills about $1.50–2 a month at the hourly schedule. It charges a post once per day, however often it's read.

**Times.** Everything is Hawaii time (UTC-10 all year, no daylight saving time), while Railway runs in UTC. Use `services/dashboard/hawaiiDays.js` for days and display formats, and `services/arrestLog/printedFormats.js` for HPD's printed dates. Never call `toLocaleString()` without a `timeZone`. Days are `YYYY-MM-DD` strings, and each one starts at 10:00 UTC.

**Views and client JS.**
- `partials/head.ejs` takes `title`, `description`, `styles` and `scripts` from the controller. Scripts load in `<head>` with `defer`, in the order given: Leaflet before `dispatchMap.js`.
- `https://checkdakine.com` is written in two places: `head.ejs` (canonical and Open Graph URLs, always without the query string) and `services/userAgent.js` (the User-Agent the geocoder and the Big Island fetches send). Change both together.
- Use escaped `<%= %>` for data; `<%-` is only for `include`. Server data reaches client JS through escaped `data-*` attributes; `data-calls` carries the map's JSON.
- Charts are server-rendered partials (`barList`, `columnChart`, `trendChart`, `officerUnits`), each with a `tableView` twin for screen readers. `dashboardCharts.js` only sets each bar's size, from `data-share` through the `--barShare` custom property.
- The date filter is shared: `partials/dateFilter.ejs`, `validateDateRange`, and `services/dateRanges.js` (the range label and the one-click preset links).
  - Each island's stats page shows it on the blue band, with all time as the default. Its `filterAction` and preset links come from `agency.paths.stats`.
  - The Dispatches history passes `filterAction` and `onLight` for the light version. It also defaults to all time.
  - Ranges are whole Hawaii days, and can't start or end after today.
- `services/chartRows.js` shapes the rows. `toTopRows` folds small rows into one "All others" bar, which suits a short tail (ethnicities). `toTopBars` suits a long tail (a week of dispatch call types): bars for the most common, the rest summed up in a line under the chart, and every row in the table, so no bar dwarfs the others.
- Pages work without JavaScript, and scripts only add to them. On Arrests, "Load more" is a link and Search applies the filters. `arrestFeed.js` adds infinite scroll and applies a filter as soon as it changes, by fetching the server-rendered page and moving its elements in, never HTML strings.

## Tests

`test/*.test.js` use `node:test` and `node:assert/strict` on pure functions, validators, and controllers given stand-in requests, so they need no database or network. `test/nav.test.js` renders the nav partial with EJS. `test/fixtures/` holds trimmed copies of HPD's dispatch page and news API response, and made-up X API responses and Big Island booking-log text pieces (real column positions, invented people). `test/bookingRegression.test.js` reads the real booking logs in the gitignored `samplePdfs/bigIsland/` and checks each against its printed totals; like the OCR regression test, it skips itself when they're absent. The validator tests run chains against a plain `{ query, body }` object, which doesn't reproduce Express 5's read-only `req.query`, so check cleaned values through `matchedData`, as they do.

## Conventions

- The backend is CommonJS. File names are camelCase, except models (`ArrestRecord.js`).
- Client JS files go in this order: DOM selectors, helpers, main logic, event listeners, each under the same block comment styles.css uses.
- `styles.css` runs Base (custom properties on `:root`), Utilities, Components, then each page section in page order, with every media query last, including the reduced-motion rule. Colors, fonts and spacing are camelCase custom properties; there are no raw colors outside `:root`.
- Comments explain why, in plain sentences, and there are a lot of them. Keep new code commented the same way.
- Commit messages are plain English and imperative, under 72 characters, and say what changed and why.
- Bobby's broader code standards are in the `boobeh123-code-standards` skill, when it's available.
