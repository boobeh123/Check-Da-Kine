<p align="center">
  👮📊

  <h3 align="center">Check Da Kine</h3>

  <p align="center">
    The original HPD Stats project was created in Python by <a href="https://www.github.com/tyliec">Tyliec</a><br />

    Check Da Kine is my take on HPD Stats using JavaScript & it's ecosystem to mimic python's functionality to track the statistics of the arrests from the <a href="https://www.honolulupd.org/">Honolulu Police Department</a>
</p>

## About The Project
The Honolulu Police Department offers the public to download PDFs containing data logged during an arrest. 
<br />
This project's goal is display the data with a modern interface & user experience
<br />
[HPD's published daily arrest log reports](https://www.honolulupd.org/information/arrest-logs/)

### Why this exists:
The Attorney General's Office provides [annual reports](https://ag.hawaii.gov/cpja/rs/cih/) as to the state of crime in Hawaii. This project provides a mechanism to validate these reports, track the numbers daily, and keep an archive of the raw data.

## How It Works
Using a combination of image cropping and OCR, we extract data about each arrest from each daily published arrest log.<br />
    * We use pdf.js with cron on a schedule to scrape data from the PDFs<br />
    * We use sharp to take images of the PDFs & convert large images in common formats to smaller, web-friendly images<br />
    * We use Tesseract.js for (OCR) Optical Character Recognition to extract data from the PDF-converted-image

### Full Breakdown

### Todo
Local OCR test
Express scaffold
Arrest-log scraper and models
Dashboard
Table
Archive
Dispatches
Map, once we pick a service to turn addresses into map coordinates
cheerio, mupdf, sharp, tesseract.js. mupdf