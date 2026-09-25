/** "oh" for 0 — on phone TTS, "zero" is often nearly inaudible. */
const DIGIT_WORDS = [
  'oh',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
] as const;

/** Expand a run of digits into spoken words, grouping US phone numbers 3-3-4. */
export function expandDigitsForSpeech(digits: string): string {
  const words = [...digits].map((d) => DIGIT_WORDS[Number(d)] ?? d);
  if (digits.length === 10) {
    return [
      words.slice(0, 3).join(' '),
      words.slice(3, 6).join(' '),
      words.slice(6).join(' '),
    ].join(', ');
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `one, ${expandDigitsForSpeech(digits.slice(1))}`;
  }
  return words.join(' ');
}

/**
 * Rewrite digit-heavy phone strings so ElevenLabs does not race through
 * "856-397-9706" and glitch into stretched vowels on the next word.
 */
export function prepareSpokenText(text: string): string {
  return text
    .replace(
      /(?:\+?1[\s-]*)?(?:\(?\d{3}\)?[\s-]*)\d{3}[\s-]*\d{4}\b/g,
      (match) => {
        const digits = match.replace(/\D/g, '');
        if (digits.length < 10) return match;
        return expandDigitsForSpeech(digits);
      },
    )
    .replace(/\b(\d{7,})\b/g, (_match, digits: string) =>
      expandDigitsForSpeech(digits),
    );
}
