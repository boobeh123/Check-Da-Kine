<p align="center">
  👮📊

  <h3 align="center">Check Da Kine</h3>

  <p align="center">
    The original HPD Stats project was created in Python by <a href="https://www.github.com/tyliec">Tyliec</a>
    <br />
    Check Da Kine is our take on HPD Stats using JavaScript & it's ecosystem to mimic the HPD Stat's functionality which uses python to track the statistics of the arrest from the Honolulu Police Department
    <br />
    Deployed on Railway: https://checkdakine.up.railway.app/
</p>

## About The Project
The Honolulu Police Department offers the public to download PDFs containing data logged during an arrest. 
<br />
This project's goal is display the data with a modern interface & user experience
<br />
[HPD's published daily arrest log reports](https://www.honolulupd.org/information/arrest-logs/)

### Why this exists:
I wanted to see what JavaScript's ecosystem is capable of, as it is my strongest language I currently understand.
The Attorney General's Office provides [annual reports](https://ag.hawaii.gov/cpja/rs/cih/) as to the state of crime in Hawaii. This project provides a mechanism to validate these reports, track the numbers daily, and keep an archive of the raw data.

## How It Works
Using a combination of image cropping and OCR, we extract data about each arrest from each daily published arrest log.<br />

### Full Breakdown

This follows the approach Tyliec designed for HPD Stats, rebuilt in JavaScript.

HPD publishes a new arrest log about every six hours (around 5 AM, 11 AM, 5 PM, and 11 PM Hawaii time). Fifteen minutes after each one, a Railway cron service runs the scraper (`npm run scrape`, [jobs/scrapeArrestLogs.js](jobs/scrapeArrestLogs.js)). It does the following:

1. Loads [HPD's arrest log page](https://www.honolulupd.org/information/arrest-logs/) with `fetch` and finds every link to an arrest log PDF with **cheerio**. HPD lists about two weeks of logs; any we haven't parsed yet are imported, oldest first ([fetchArrestLogs.js](services/arrestLog/fetchArrestLogs.js))
2. Downloads each new PDF into memory (nothing is written to disk) and uploads a copy to **Cloudinary** for archiving, since HPD removes old logs ([archivePdf.js](services/arrestLog/archivePdf.js))

With the PDF in memory, we prepare it for image cropping and OCR. To do this, we

1. Draw each page as an image with **pdf.js**, onto an in-memory canvas from **@napi-rs/canvas**, at twice the PDF's size. pdf.js reads pages directly, so there's no separate step to split the PDF into pages ([renderPages.js](services/arrestLog/renderPages.js))
2. Crop the header and footer off each page and stack the pages into one tall image, so an arrest that runs across a page break stays in one piece ([segmentRecords.js](services/arrestLog/segmentRecords.js))
3. Find where each arrest starts by scanning one column of pixels for the first dark pixel of its date, then do the same in another column to find where each charge starts within that arrest
4. Crop each field we want to parse using fixed pixel boxes ([layoutConstants.js](services/arrestLog/layoutConstants.js)):
   - for the arrest: date, time, ethnicity, sex, age, and name
   - for each charge: report number, offense, statute, location, arresting officer, court information, and release information
5. Enlarge each crop 3x with **sharp** and read it with OCR (**Tesseract.js**) ([ocrFields.js](services/arrestLog/ocrFields.js))
6. Clean up the text: correct known misreads (for example `Hawai` becomes `Hawaiian`) and flag values that don't look right, like an age that isn't a number, instead of saving them silently ([parseArrestLog.js](services/arrestLog/parseArrestLog.js))

We then save the arrests to **MongoDB** with **Mongoose**. Logs overlap (each covers 12 hours, but a new one comes out every 6), so the same arrest appears in more than one log. Each arrest is matched on its arrest time, report number, sex, and age and saved once, and when HPD corrects an arrest in a later log, the newer version replaces the old one ([saveRecord.js](services/arrestLog/saveRecord.js)). Each log's progress is tracked too, so a log that fails is retried on the next run.

**Express** and **EJS** serve the site. The home page's statistics and charts are counted by MongoDB for the chosen date range, and the Arrests page lists every arrest as a card, newest first, loading more as you scroll. Arrestee and officer names are only shown to logged-in users; accounts are invite-only (**Passport**, created with `npm run create-user`).

To try the parser on a PDF you've downloaded, run `npm run parse -- path/to/Arrest_Log.pdf`; it prints how many arrests it found and saves them as JSON next to the PDF.