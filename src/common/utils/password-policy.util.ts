/**
 * Shared password policy — min 6 chars, must contain uppercase + lowercase +
 * digit, no whitespace. Enforced on new/changed passwords (register, and any
 * future password-change flow). Existing passwords are left untouched —
 * bcrypt hashes cannot be re-validated against a policy.
 */
export const PASSWORD_MIN_LENGTH = 6;

export const PASSWORD_HAS_UPPERCASE = /[A-Z]/;
export const PASSWORD_HAS_LOWERCASE = /[a-z]/;
export const PASSWORD_HAS_DIGIT = /\d/;
export const PASSWORD_NO_WHITESPACE = /^\S+$/;

export const PASSWORD_RULE_MESSAGE =
  'Password minimal 6 karakter, kombinasi huruf besar, huruf kecil, dan angka (tanpa spasi)';

/** True when the candidate password satisfies the full policy. */
export function isPasswordValid(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    PASSWORD_HAS_UPPERCASE.test(password) &&
    PASSWORD_HAS_LOWERCASE.test(password) &&
    PASSWORD_HAS_DIGIT.test(password) &&
    PASSWORD_NO_WHITESPACE.test(password)
  );
}
