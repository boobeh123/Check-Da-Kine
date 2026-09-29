<p align="center">
  👮📊

  <h3 align="center">Check Da Kine</h3>

  <p align="center">
    The original HPD Stats project was created in Python by <a href="https://www.github.com/tyliec">Tyliec</a>
    <br /><br />
    Check Da Kine is our take on HPD Stats, rebuilt with JavaScript and its ecosystem, to track statistics on arrests by the Honolulu Police Department
    <br /><br />
    Deployed on Railway: https://checkdakine.up.railway.app/
</p>

## About The Project
The Honolulu Police Department publishes the data it logs for each arrest as PDFs that anyone can download, along with a list of the police dispatch calls it's currently handling.
<br />
This project's goal is to display that data with a modern interface and user experience.
<br />
[HPD's published arrest logs](https://www.honolulupd.org/information/arrest-logs/) · [HPD's active dispatch calls](https://www.honolulupd.org/wp-content/hpd/cfs/Incidents_past_24_hours.html)

### Why this exists:
I wanted to see what JavaScript's ecosystem is capable of, since it's my strongest language.<br /><br />
The Attorney General's Office provides [annual reports](https://ag.hawaii.gov/cpja/rs/cih/) as to the state of crime in Hawaii. This project provides a mechanism to validate these reports, track the numbers daily, and keep an archive of the raw data.

## How It Works
Using a combination of image cropping and OCR, we extract data about each arrest from every arrest log HPD publishes (four a day). A second scraper records HPD's active dispatch calls every 10 minutes and places them on a map, and a third picks up HPD's latest news releases and posts on X every hour.

### Features
* Full-stack web application deployed with Railway
* Accessible to screen readers
* Responsive to mobile viewports
* Data visualization & Rendering data dynamically with MongoDB
* Authentication & User accounts with Passport.js localStrategy
* Web scrapers with cron schedules
* X API 
* OpenStreetMap & Leaflet APIs
* OCR of HPD's PDF arrest logs in JavaScript with pdf.js, sharp & Tesseract.js
* De-duplicated arrests across overlapping logs, with every PDF archived to Cloudinary
* Arrest cards with infinite scroll that still works without JavaScript
* Arrest search by charge, statute, location, or report number (MongoDB text index)
* Arrestee & officer names shown only to logged-in users
* Date range filter with Last 7 days, Last 30 days & All time presets
* Arrests-over-time chart with hover tooltips, grouped by day, week, or month
* Active dispatch calls geocoded onto a map, linked to the call list
* HPD news releases from its WordPress API
* Out-of-date notices when HPD's data stops updating
* Security headers (Helmet CSP), a rate-limited login & validated input
* Animations that respect reduced-motion settings
* Share previews (Open Graph) & a custom favicon
* Unit tests with Node's built-in test runner, including an OCR regression check

### Technologies
<img src="https://img.shields.io/badge/html5%20-%23E34F26.svg?&style=for-the-badge&logo=html5&logoColor=white" alt="HTML" height="50"/><img src="https://img.shields.io/badge/css3%20-%231572B6.svg?&style=for-the-badge&logo=css3&logoColor=white" alt="CSS" height="50"/><img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript" height="50"/><img src="https://img.shields.io/badge/node.js%20-3F873F.svg?&style=for-the-badge&logo=node.js&logoColor=white" alt="Node" height="50"/><img src="https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express" height="50"/><img src="https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB" height="50"/><img src="https://img.shields.io/badge/Mongoose.js-8A0403?style=for-the-badge&logoColor=white" alt="Mongoose" /><img src="https://img.shields.io/badge/EJS-B4CA65?style=for-the-badge&logo=ejs&logoColor=black" alt="EJS" height="50"/><img src="https://img.shields.io/badge/Passport-34E27A?style=for-the-badge&logo=passport&logoColor=white" alt="Passport" height="50"/><img src="https://img.shields.io/badge/Cloudinary-3448C5?style=for-the-badge&logo=cloudinary&logoColor=white" alt="Cloudinary" height="50"/><img src="https://img.shields.io/badge/Leaflet-199900?style=for-the-badge&logo=leaflet&logoColor=white" alt="Leaflet" height="50"/>

### Full Breakdown

This follows the approach Tyliec designed for HPD Stats, rebuilt in JavaScript.

HPD publishes a new arrest log about every six hours (around 5 AM, 11 AM, 5 PM, and 11 PM Hawaii time). Each file goes up about 10 minutes after the time in its name, and HPD's listing page is cached for up to 10 minutes more, so a Railway cron service runs the scraper every hour at 40 past (`npm run scrape`, [jobs/scrapeArrestLogs.js](jobs/scrapeArrestLogs.js)). That picks up each log about half an hour after it appears, and a late one within the hour; a run with nothing new just reads HPD's list and exits. It does the following:

1. Loads [HPD's arrest log page](https://www.honolulupd.org/information/arrest-logs/) with `fetch` and finds every link to an arrest log PDF with **cheerio**. HPD lists about two weeks of logs; any we haven't parsed yet are imported, oldest first ([fetchArrestLogs.js](services/arrestLog/fetchArrestLogs.js))
2. Downloads each new PDF into memory (nothing is written to disk) and uploads a copy to **Cloudinary** for archiving, since HPD removes old logs ([archivePdf.js](services/arrestLog/archivePdf.js))

With the PDF in memory, we prepare it for image cropping and OCR. To do this, we

1. Draw each page as an image with **pdf.js**, onto an in-memory canvas from **@napi-rs/canvas**, at twice the PDF's size. pdf.js reads pages directly, so there's no separate step to split the PDF into pages ([renderPages.js](services/arrestLog/renderPages.js))
2. Crop the header and footer off each page and stack the pages into one tall image, so an arrest that runs across a page break stays in one piece ([segmentRecords.js](services/arrestLog/segmentRecords.js))
3. Find where each arrest starts by scanning one column of pixels for the first dark pixel of its date, then do the same in another column to find where each charge starts within that arrest
4. Crop each field we want to parse ([layoutConstants.js](services/arrestLog/layoutConstants.js)):
   - for the arrest: date, time, ethnicity, sex, age, and name
   - for each charge: report number, offense, statute, location, arresting officer, court information, and release information

   Most fields use fixed pixel boxes. Two are found by scanning the pixels instead:
   - the **age** starts just after the slash in `F / 67`, and where depends on the letter before it (a fixed box used to cut off the first digit of women's ages)
   - the **release info** (`RBL / 500`) is split at the spaces around its slash, so the code and the amount are read separately and the slash can't be misread as a 7
5. Enlarge each crop with **sharp** and read it with OCR (**Tesseract.js**). Short fields with a known alphabet (ages, release codes, amounts) are read as digits or letters only, with a white margin, which Tesseract reads far more reliably ([ocrFields.js](services/arrestLog/ocrFields.js))
6. Clean up the text: match ethnicities against HPD's categories, including cut-off readings (`Hawai` and `Hawaiic` become `Hawaiian`), and flag values that don't look right, like an age that isn't a number, instead of saving them silently ([parseArrestLog.js](services/arrestLog/parseArrestLog.js))

We then save the arrests to **MongoDB** with **Mongoose**. Logs overlap (each covers 12 hours, but a new one comes out every 6), so the same arrest appears in more than one log. Each arrest is matched on its arrest time, incident number (the report number without its charge suffix), sex, and age, and saved once. Names are left out of the match on purpose: a cut-off name picks up different OCR noise in each log, which would make one person look like two. When HPD corrects an arrest in a later log, the newer version replaces the old one ([toRecordFields.js](services/arrestLog/toRecordFields.js), [saveRecord.js](services/arrestLog/saveRecord.js)). Each log's progress is tracked too, so a log that fails is retried on the next run.

When the parser improves, `npm run reparse` re-reads every stored log from its archived copy and rebuilds all the arrests. It builds in a separate collection and swaps it in only at the end, so if anything goes wrong, nothing changes ([rebuildArrestRecords.js](services/arrestLog/rebuildArrestRecords.js)).

#### Dispatch calls

A second Railway cron service runs `npm run scrape-dispatches` every 10 minutes ([jobs/scrapeDispatches.js](jobs/scrapeDispatches.js)):

1. Reads [HPD's active dispatch calls page](https://www.honolulupd.org/wp-content/hpd/cfs/Incidents_past_24_hours.html) with **cheerio**. Despite its file name, the page lists only calls that are still open ([fetchDispatches.js](services/dispatches/fetchDispatches.js))
2. Saves each call once. Every check that lists a call again moves its "last seen" time forward, so we know which calls are open now and roughly when the others closed ([saveDispatches.js](services/dispatches/saveDispatches.js))
3. Places new addresses on the map with OpenStreetMap's free **Nominatim** geocoder, at most one lookup per second and 30 per run (any extra wait for the next run), remembering each result so no address is looked up twice. HPD masks house numbers (`51XX LIKINI ST` is the 5100 block) and drops the hyphen from Oahu's zone-lot numbers (`911200` is `91-1200`), so both are rebuilt first; when a block can't be found, the call is placed on its street ([geocodePlaces.js](services/dispatches/geocodePlaces.js))

#### HPD news

A third Railway cron service runs `npm run scrape-news` every hour ([jobs/scrapeNews.js](jobs/scrapeNews.js)):

1. Reads HPD's 10 latest news releases from its website's WordPress API, with each release's photo when it has one, and turns the titles and excerpts into plain text ([fetchNewsReleases.js](services/news/fetchNewsReleases.js))
2. Keeps the stored releases the same as HPD's latest: new ones are added, and ones HPD no longer lists (older, or taken down) are removed ([saveNewsReleases.js](services/news/saveNewsReleases.js))
3. Reads [@honolulupolice](https://x.com/honolulupolice)'s 10 latest posts from X's API, when `X_BEARER_TOKEN` is set, and keeps them the same way, so a post deleted on X disappears here too ([fetchXPosts.js](services/news/fetchXPosts.js), [saveXPosts.js](services/news/saveXPosts.js)). X charges per post read, but only once per post per day, so hourly checks cost about the same as one a day (roughly $1.50–2 a month). Each post's text is shown in full, with its links, @mentions, and #hashtags as links, following X's display requirements

HPD's website and X are checked separately, so a problem with one never stops the other.

#### The website

**Express** and **EJS** serve the site:

- **Home:** arrest statistics for a chosen date range, counted by MongoDB, with a chart of arrests over time in the Arrests tile. Below them, HPD's latest news releases and posts on X as cards linking to HPD's site and X, then charts by age, ethnicity, and officer. A notice appears if no new arrest log has arrived in 8 hours
- **Arrests:** every arrest as a card, newest first, loading more as you scroll, and searchable by charge, statute, location, or report number (a MongoDB text index; names aren't searchable). Arrestee and officer names are only shown to logged-in users; accounts are invite-only (**Passport**, created with `npm run create-user`)
- **Dispatches:** a **Leaflet** map and list of the calls HPD is handling now, linked so that pointing at a call in either one highlights it in the other, plus counts by call type and district for the last 7 days. A notice appears if HPD's list hasn't changed in an hour

#### Running it

The site and the three scrapers are four services on Railway, all deployed from this repository. The environment variables they need are listed in `.env.example`.

| Command | What it does |
|---|---|
| `npm run dev` | Runs the website locally, restarting when a file changes |
| `npm start` | Runs the website (Railway's web service) |
| `npm run scrape` | Imports new arrest logs (Railway cron, every hour at 40 past) |
| `npm run scrape-dispatches` | Checks HPD's dispatch calls (Railway cron, every 10 minutes) |
| `npm run scrape-news` | Checks HPD's latest news releases, and its X posts when `X_BEARER_TOKEN` is set (Railway cron, every hour) |
| `npm run reparse` | Rebuilds every stored arrest with the current parser |
| `npm run create-user -- --email you@example.com` | Creates an invite-only login and prints its password once (`--reset` for a new password) |
| `npm run parse -- path/to/Arrest_Log.pdf` | Tries the parser on a downloaded PDF and saves the results as JSON next to it |
| `npm test` | Runs the unit tests in `test/` with Node's built-in test runner. The OCR check re-reads the PDFs in `samplePdfs/` against the JSON saved beside them, and skips itself when that folder is missing |