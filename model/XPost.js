const mongoose = require('mongoose');

// One of HPD's latest posts on X. Only the latest few are kept, so a post deleted on X
// disappears here too, as X's developer terms require.
const xPostSchema = new mongoose.Schema(
  {
    postId: { type: String, required: true, unique: true }, // X ids are too big for a JS number
    postedAt: { type: Date, required: true, index: true },
    username: { type: String, required: true, maxLength: 50 },
    name: { type: String, maxLength: 100 },
    avatarUrl: { type: String, maxLength: 500 },
    url: { type: String, required: true, maxLength: 200 }, // The post on x.com
    // The post's text in order, with its links, @mentions, and #hashtags as links
    segments: [
      {
        _id: false,
        text: { type: String, maxLength: 30000 },
        href: { type: String, maxLength: 2000 },
      },
    ],
    // The first photo or video (as its preview image), and how many more the post has
    media: {
      url: { type: String, maxLength: 500 },
      alt: { type: String, maxLength: 1000 },
      isVideo: Boolean,
    },
    moreMediaCount: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('XPost', xPostSchema);
