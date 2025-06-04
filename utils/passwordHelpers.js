// Password validation helper
const validatePassword = (pw) => {
  const errors = [];

  if (pw.length < 6) {
    errors.push("Password must be at least 6 characters");
  }
  if (!/[A-Z]/.test(pw)) {
    errors.push("Password must include at least one uppercase letter");
  }
  if (!/\d/.test(pw)) {
    errors.push("Password must include at least one number");
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(pw)) {
    errors.push("Password must include at least one special character");
  }

  return errors; // Return array of errors (empty if valid)
};

module.exports = validatePassword; 