// Reads HPD's latest posts from X's API (paid per post read). Each run makes two requests,
// the account and its 10 latest posts, and X charges a post once per day however often
// it's read, so hourly runs cost the same as one a day.

const xApi = 'https://api.x.com/2';
const account = 'honolulupolice';
const latestCount = 10;
const requestTimeoutMs = 30 * 1000;
const xImageHost = 'https://pbs.twimg.com/'; // The only X host the page allows images from

// What each error status means for this job
const xErrors = {
  401: 'X rejected the Bearer token',
  402: 'the X credits are used up',
  403: "the X app doesn't have access to this",
  429: 'X is rate limiting; the next run will try again',
};

const getFromX = async (path, token) => {
  const response = await fetch(`${xApi}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (!response.ok) throw new Error(`X returned ${response.status}${xErrors[response.status] ? `: ${xErrors[response.status]}` : ''}`);
  return response.json();
};

// X sends <, >, and & escaped in post text
const decode = (text) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const isWebLink = (url) => typeof url === 'string' && /^https?:\/\//.test(url);
const onXImageHost = (url) => (typeof url === 'string' && url.startsWith(xImageHost) ? url : null);

// t.co links, @mentions, and #hashtags, in the order they appear
const linkPattern = /https:\/\/t\.co\/\w+|@\w+|#[\p{L}\p{N}_]+/gu;

// Splits a post's text into [{ text, href? }], linking what X's entities list. Found by
// matching the text rather than by the entities' positions, which count characters
// differently from JavaScript. The t.co link to attached media is dropped, since the card
// shows the photo itself, as X does.
const toSegments = (text, entities = {}) => {
  const urls = new Map((entities.urls ?? []).map((entity) => [entity.url, entity]));
  const mentions = new Set((entities.mentions ?? []).map((mention) => mention.username.toLowerCase()));
  const hashtags = new Set((entities.hashtags ?? []).map((hashtag) => hashtag.tag.toLowerCase()));

  // A segment for the match, null to drop it, or undefined to leave it as plain text
  const toLink = (match) => {
    if (match.startsWith('https://t.co/')) {
      const entity = urls.get(match);
      if (!entity) return undefined;
      if (entity.media_key || /\/(photo|video)\/\d+$/.test(entity.expanded_url ?? '')) return null;
      return isWebLink(entity.expanded_url) ? { text: entity.display_url ?? entity.expanded_url, href: entity.expanded_url } : undefined;
    }
    const word = match.slice(1);
    if (match.startsWith('@') && mentions.has(word.toLowerCase())) return { text: match, href: `https://x.com/${word}` };
    if (match.startsWith('#') && hashtags.has(word.toLowerCase())) {
      return { text: match, href: `https://x.com/hashtag/${encodeURIComponent(word)}` };
    }
    return undefined;
  };

  const segments = [];
  const addText = (piece) => {
    if (piece) segments.push({ text: decode(piece) });
  };
  let plainStart = 0;
  for (const match of text.matchAll(linkPattern)) {
    const link = toLink(match[0]);
    if (link === undefined) continue;
    addText(text.slice(plainStart, match.index));
    if (link) segments.push(link);
    plainStart = match.index + match[0].length;
  }
  addText(text.slice(plainStart));

  // Dropping a trailing media link leaves the space before it
  const last = segments[segments.length - 1];
  if (last && !last.href) last.text = last.text.trimEnd();
  return segments.filter((segment) => segment.text !== '');
};

// The first attached photo, or a video's preview image
const toMedia = (post, mediaByKey) => {
  const attached = (post.attachments?.media_keys ?? []).map((key) => mediaByKey.get(key)).filter(Boolean);
  const [first] = attached;
  if (!first) return { media: null, moreMediaCount: 0 };

  const isVideo = first.type !== 'photo';
  const url = onXImageHost(isVideo ? first.preview_image_url : first.url && `${first.url}?name=small`);
  return url ? { media: { url, alt: first.alt_text ?? '', isVideo }, moreMediaCount: attached.length - 1 } : { media: null, moreMediaCount: 0 };
};

// One post from X's API -> the fields saved on an XPost. Long posts keep their full text in
// note_tweet; post text is shown as X sends it, never shortened (X's display requirements).
const toPostCard = (post, mediaByKey, user) => {
  const { text, entities } = post.note_tweet ?? post;
  return {
    postId: post.id,
    postedAt: new Date(post.created_at),
    username: user.username,
    name: user.name,
    // "_normal" is 48px; "_bigger" (73px) stays sharp on high-density screens
    avatarUrl: onXImageHost(user.profile_image_url?.replace('_normal.', '_bigger.')),
    url: `https://x.com/${user.username}/status/${post.id}`,
    segments: toSegments(text, entities),
    ...toMedia(post, mediaByKey),
  };
};

// The account lookup and timeline responses -> post cards, newest first
const toPostCards = (userResponse, timelineResponse) => {
  const user = userResponse.data;
  if (!user) throw new Error(`X couldn't find @${account}`);
  const mediaByKey = new Map((timelineResponse.includes?.media ?? []).map((media) => [media.media_key, media]));
  return (timelineResponse.data ?? []).map((post) => toPostCard(post, mediaByKey, user));
};

const fetchXPosts = async (token) => {
  const userResponse = await getFromX(`/users/by/username/${account}?user.fields=name,profile_image_url`, token);
  if (!userResponse.data) throw new Error(`X couldn't find @${account}`);

  const params = new URLSearchParams({
    max_results: String(latestCount),
    exclude: 'replies,retweets',
    'tweet.fields': 'created_at,entities,attachments,note_tweet',
    expansions: 'attachments.media_keys',
    'media.fields': 'type,url,preview_image_url,alt_text',
  });
  const timelineResponse = await getFromX(`/users/${userResponse.data.id}/tweets?${params}`, token);
  return toPostCards(userResponse, timelineResponse);
};

module.exports = { fetchXPosts, toPostCards, xProfileUrl: `https://x.com/${account}` };
