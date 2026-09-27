const { validationResult, matchedData } = require('express-validator');
const { listArrests } = require('../services/arrests/listArrests');

exports.getArrests = async (req, res) => {
  const result = validationResult(req);
  // Both cursor fields share one message, so show each message once
  const errors = [...new Set(result.array().map((error) => error.msg))];

  // A broken cursor falls back to the newest arrests, with the message shown above them
  const { beforeTime, beforeId } = result.isEmpty() ? matchedData(req) : {};
  const cursor = beforeTime && beforeId ? { beforeTime, beforeId } : null;

  // Names are for logged-in users only; req.user doesn't exist until login is added
  const showNames = Boolean(req.user);
  const feed = await listArrests({ cursor, showNames });

  res.status(errors.length > 0 ? 400 : 200).render('arrestsView', {
    title: 'Arrests',
    scripts: ['/js/arrestFeed.js'],
    errors,
    showNames,
    ...feed,
  });
};
