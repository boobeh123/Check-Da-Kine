// Keeps the stored releases the same as HPD's latest: adds new ones, updates edited ones,
// and removes any that are no longer among them (older, or taken down by HPD).

const mongoose = require('mongoose');
const NewsRelease = require('../../model/NewsRelease');

// Returns how many releases were new and how many were removed
const saveNewsReleases = async (releases) => {
  // An empty list means something went wrong upstream; never clear the page because of it
  if (releases.length === 0) return { created: 0, removed: 0 };

  const result = await NewsRelease.bulkWrite(
    releases.map((release) => ({
      updateOne: { filter: { wpId: release.wpId }, update: { $set: release }, upsert: true },
    }))
  );
  const { deletedCount } = await NewsRelease.deleteMany({
    wpId: mongoose.trusted({ $nin: releases.map((release) => release.wpId) }),
  });

  return { created: result.upsertedCount, removed: deletedCount };
};

module.exports = { saveNewsReleases };
