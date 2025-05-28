// Password validation helper
const validatePassword = (pw) =>
  pw.length >= 6 && /[A-Z]/.test(pw) && /\d/.test(pw);

module.exports = validatePassword; 