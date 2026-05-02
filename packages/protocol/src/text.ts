export function normalizeTranscriptText(text: string): string {
  return text.toLocaleLowerCase().replace(/[\p{P}\p{S}\s]+/gu, "");
}
