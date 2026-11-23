/**
 * Small validators that are shared between the forms.
 */

/**
 * Checks that a value looks like a GitHub repository url.
 */
export function isLikelyGithubUrl(value: string) {
  return /^https?:\/\/(www\.)?github\.com\/[^/\s]+\/[^/\s]+/i.test(value.trim());
}
