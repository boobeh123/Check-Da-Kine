// Keeps the stored posts the same as HPD's latest on X: adds new ones, updates edited ones,
// and removes any that are no longer among them (older, or deleted on X).

const mongoose = require('mongoose');
const XPost = require('../../model/XPost');

// Returns how many posts were new and how many were removed
const saveXPosts = async (posts) => {
  // An empty list means something went wrong upstream; never clear the page because of it
  if (posts.length === 0) return { created: 0, removed: 0 };

  const result = await XPost.bulkWrite(
    posts.map((post) => ({
      updateOne: { filter: { postId: post.postId }, update: { $set: post }, upsert: true },
    }))
  );
  const { deletedCount } = await XPost.deleteMany({
    postId: mongoose.trusted({ $nin: posts.map((post) => post.postId) }),
  });

  return { created: result.upsertedCount, removed: deletedCount };
};

module.exports = { saveXPosts };
