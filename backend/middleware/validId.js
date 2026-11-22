// middleware/validId.js — use with router.param: a malformed id in the URL is
// answered with 404 instead of reaching the database (which would throw a CastError).
const OBJECT_ID = /^[a-f0-9]{24}$/i;
const validId = (req, res, next, value) =>
  OBJECT_ID.test(String(value)) ? next() : res.status(404).json({ success: false, message: "Not found" });
module.exports = { validId };
