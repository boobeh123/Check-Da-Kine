// The islands Check Da Kine covers, one police department each. Every page, query and string
// that differs between them comes from here, so adding an island is one more entry: its models,
// its pages' paths, its archive folder, how often its logs arrive, and its words. The stats and
// arrests pages pick the island from the route (middleware/agency.js), and Oʻahu is the default.

const ArrestLog = require('../model/ArrestLog');
const ArrestRecord = require('../model/ArrestRecord');
const BigIslandBookingLog = require('../model/BigIslandBookingLog');
const BigIslandArrest = require('../model/BigIslandArrest');

const oahu = {
  key: 'oahu',
  name: 'Oʻahu',
  paths: { stats: '/', arrests: '/arrests' },
  Log: ArrestLog,
  Record: ArrestRecord,
  archiveFolder: 'checkDaKine/arrestLogs',
  // HPD publishes a log every 6 hours, so this allows for one arriving a little late
  staleAfterHours: 8,
  hasNews: true, // HPD's news releases and X posts are on Oʻahu's stats page
  copy: {
    statsTitle: 'Honolulu Police Department arrest statistics',
    statsDescription: "Arrests from the Honolulu Police Department's published arrest logs, counted by age, sex, and ethnicity for any date range.",
    statsLead: "Check Da Kine turns the Honolulu Police Department's published arrest logs into statistics anyone can explore.",
    staleMessage: (since, ago) =>
      `No new arrest log since ${since} (${ago}). Either HPD hasn't published one, or our scraper has stopped.`,
    noLogsYet: 'No arrest logs have been imported yet.',
    flaggedNote: "of these arrests have a field that OCR couldn't read cleanly. They're still counted wherever the field was readable.",
    ethnicityWord: 'ethnicity',
    ethnicityCaption: 'Ethnicities as HPD prints them. An arrest listing more than one ethnicity counts toward each.',
    officerGroupWord: 'ethnic group', // "colored by the ethnic group they arrested most"
    officerCaveat:
      "Read this with care. An officer's most-arrested group mostly reflects where they patrol, and an officer with one or two arrests gets a color from very little data. Officer names come from OCR, so a misread name can split one officer into two.",
    aboutLead:
      'HPD publishes a new arrest log as a PDF about every six hours. We read each one, pull out every arrest, and keep a single de-duplicated record of each,',
    arrestsTitle: 'Arrests',
    arrestsDescription:
      "Every arrest in the Honolulu Police Department's published arrest logs, newest first, with each charge, statute, and court date. Search and filter by charge, sex, location, or report number.",
    arrestsLead: "Every arrest from HPD's published arrest logs, newest first. An arrest is not a conviction.",
    withheldNote: 'Arrestee and officer names are withheld.',
    searchHint: 'Whole words in a charge, statute, location, or report number, like ASSAULT, KALAKAUA, or 708-0833.',
    sourceName: "HPD's arrest log",
    readNote: "Read from HPD's PDF by OCR, so this text may not be completely accurate.",
  },
};

const bigIsland = {
  key: 'bigIsland',
  name: 'Big Island',
  paths: { stats: '/big-island', arrests: '/big-island/arrests' },
  Log: BigIslandBookingLog,
  Record: BigIslandArrest,
  archiveFolder: 'checkDaKine/bigIslandBookings',
  // One log a morning, posted around 7 AM; the department sometimes skips a day
  staleAfterHours: 30,
  hasNews: false,
  copy: {
    statsTitle: 'Big Island arrest statistics',
    statsDescription:
      "Arrests from the Hawaiʻi Police Department's published booking logs for the Big Island, counted by age, sex, and race for any date range.",
    statsLead: "Check Da Kine turns the Hawaiʻi Police Department's published booking logs into statistics anyone can explore.",
    staleMessage: (since, ago) =>
      `No new booking log since ${since} (${ago}). Either the Hawaiʻi Police Department hasn't published one, or our scraper has stopped.`,
    noLogsYet: 'No booking logs have been imported yet.',
    flaggedNote: "of these arrests have a field that didn't read cleanly. They're still counted wherever the field was readable.",
    ethnicityWord: 'race',
    ethnicityCaption: 'Race as the Hawaiʻi Police Department prints it.',
    // The chart's groups mix race and ethnicity ("Hispanic"), so this one says neither
    officerGroupWord: 'group',
    officerCaveat:
      "Read this with care. An officer's most-arrested group mostly reflects where they patrol, and an officer with one or two arrests gets a color from very little data.",
    aboutLead:
      'The Hawaiʻi Police Department publishes a booking log as a PDF each morning, covering about 48 hours. We read each one, pull out every booking, and keep a single record of each,',
    arrestsTitle: 'Big Island arrests',
    arrestsDescription:
      "Every arrest in the Hawaiʻi Police Department's published booking logs for the Big Island, newest first, with each charge, statute, bail, and court date. Search and filter by charge, sex, or report number.",
    arrestsLead: "Every arrest from the Hawaiʻi Police Department's published booking logs, newest first. An arrest is not a conviction.",
    withheldNote: 'Arrestee and officer names, and hometowns, are withheld.',
    searchHint: 'Whole words in a charge, statute, or report number, like ASSAULT, OVUII, or 291E-0061.',
    sourceName: "the Hawaiʻi Police Department's booking log",
    readNote: "Read from the department's PDF, which calls this data preliminary and subject to change.",
  },
};

const agencies = { oahu, bigIsland };

module.exports = { agencies, islandList: Object.values(agencies) };
