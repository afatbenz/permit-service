const NON_LETTERS = /[^A-Z]/g;
const VOWELS = /[AEIOU]/g;

/**
 * Extracts up to 5 consonant letters from an organization name.
 * "PT. Jaya Obayashi" -> "JYBYS" (J,Y,B,Y,S,H, first 5 taken)
 *
 * Falls back to any remaining letters (including vowels), then pads with
 * 'X', for names too short or too vowel-heavy to yield 5 consonants
 * (e.g. "PT AI").
 */
export function buildOrganizationCodeLetters(name: string): string {
  const lettersOnly = name.toUpperCase().replace(NON_LETTERS, '');
  const consonantsOnly = lettersOnly.replace(VOWELS, '');

  let letters = consonantsOnly.slice(0, 5);

  if (letters.length < 5) {
    letters = (letters + lettersOnly).slice(0, 5);
  }
  while (letters.length < 5) {
    letters += 'X';
  }

  return letters;
}

function randomThreeDigits(): string {
  return String(Math.floor(100 + Math.random() * 900)); // 100-999
}

/**
 * Generates an organization code: 5 consonant letters from the name + 3
 * random digits, e.g. "JYBYS482". Not guaranteed unique by itself — the
 * caller (OrganizationService) must retry against the DB on collision.
 */
export function generateOrganizationCode(name: string): string {
  return `${buildOrganizationCodeLetters(name)}${randomThreeDigits()}`;
}
