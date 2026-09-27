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
Using a combination of image cropping and OCR, we extract data about each arrest from every arrest log HPD publishes (four a day). A second scraper records HPD's active dispatch calls every 10 minutes and places them on a map.

### Full Breakdown

This follows the approach Tyliec designed for HPD Stats, rebuilt in JavaScript.

HPD publishes a new arrest log about every six hours (around 5 AM, 11 AM, 5 PM, and 11 PM Hawaii time). Fifteen minutes after each one, a Railway cron service runs the scraper (`npm run scrape`, [jobs/scrapeArrestLogs.js](jobs/scrapeArrestLogs.js)). It does the following:

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

We then save the arrests to **MongoDB** with **Mongoose**. Logs overlap (each covers 12 hours, but a new one comes out every 6), so the same arrest appears in more than one log. Each arrest is matched on its arrest time, report number, sex, and age and saved once, and when HPD corrects an arrest in a later log, the newer version replaces the old one ([saveRecord.js](services/arrestLog/saveRecord.js)). Each log's progress is tracked too, so a log that fails is retried on the next run.

When the parser improves, `npm run reparse` re-reads every stored log from its archived copy and rebuilds all the arrests. It builds in a separate collection and swaps it in only at the end, so if anything goes wrong, nothing changes ([rebuildArrestRecords.js](services/arrestLog/rebuildArrestRecords.js)).

#### Dispatch calls

A second Railway cron service runs `npm run scrape-dispatches` every 10 minutes ([jobs/scrapeDispatches.js](jobs/scrapeDispatches.js)):

1. Reads [HPD's active dispatch calls page](https://www.honolulupd.org/wp-content/hpd/cfs/Incidents_past_24_hours.html) with **cheerio**. Despite its file name, the page lists only calls that are still open ([fetchDispatches.js](services/dispatches/fetchDispatches.js))
2. Saves each call once. Every check that lists a call again moves its "last seen" time forward, so we know which calls are open now and roughly when the others closed ([saveDispatches.js](services/dispatches/saveDispatches.js))
3. Places new addresses on the map with OpenStreetMap's free **Nominatim** geocoder, one lookup per second, remembering each result so no address is looked up twice. HPD masks house numbers (`51XX LIKINI ST` is the 5100 block) and drops the hyphen from Oahu's zone-lot numbers (`911200` is `91-1200`), so both are rebuilt first; when a block can't be found, the call is placed on its street ([geocodePlaces.js](services/dispatches/geocodePlaces.js))

#### The website

**Express** and **EJS** serve the site:

- **Home:** statistics and charts for a chosen date range, counted by MongoDB
- **Arrests:** every arrest as a card, newest first, loading more as you scroll. Arrestee and officer names are only shown to logged-in users; accounts are invite-only (**Passport**, created with `npm run create-user`)
- **Dispatches:** a **Leaflet** map and list of the calls HPD is handling now, plus counts by call type and district for the last 7 days

#### Running it

The site and the two scrapers are three services on Railway, all deployed from this repository. The environment variables they need are listed in `.env.example`.

| Command | What it does |
|---|---|
| `npm run dev` | Runs the website locally, restarting when a file changes |
| `npm start` | Runs the website (Railway's web service) |
| `npm run scrape` | Imports new arrest logs (Railway cron, 15 minutes after each HPD log) |
| `npm run scrape-dispatches` | Checks HPD's dispatch calls (Railway cron, every 10 minutes) |
| `npm run reparse` | Rebuilds every stored arrest with the current parser |
| `npm run create-user -- --email you@example.com` | Creates an invite-only login and prints its password once (`--reset` for a new password) |
| `npm run parse -- path/to/Arrest_Log.pdf` | Tries the parser on a downloaded PDF and saves the results as JSON next to it |