import cron from "node-cron";

export function isValidCron(expression) {
  if (typeof expression !== "string") return false;
  const trimmed = expression.trim();
  return trimmed.split(/\s+/).length === 5 && cron.validate(trimmed);
}

export function isValidTimezone(timezone) {
  if (typeof timezone !== "string" || timezone.trim() === "") return false;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone.trim() }).format();
    return true;
  } catch {
    return false;
  }
}

export function validateMessage(message) {
  if (typeof message !== "string" || message.trim() === "") {
    return "The message cannot be empty.";
  }
  if (message.length > 2_000) {
    return "Discord messages cannot be longer than 2,000 characters.";
  }
  return null;
}
