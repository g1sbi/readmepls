/** Returns an error message for invalid sign-in credentials, or null if valid. */
export function validateCredentials(email: string, password: string): string | null {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "Enter a valid email.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  return null;
}
