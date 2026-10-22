/** Vercel functions accept request bodies up to 4.5 MB, so uploads stay below that. */
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
export const TOO_LARGE = "Filen är större än 4 MB. Ta ett foto med lägre upplösning eller ladda upp en PDF.";

/**
 * Checked in the browser before sending: a file over the platform's limit never
 * reaches the server action (the request is refused on the way in), so the form
 * would fail without a word.
 */
export function fileTooLarge(data: FormData): boolean {
  const file = data.get("file");
  return typeof file === "object" && file !== null && "size" in file && file.size > MAX_DOCUMENT_BYTES;
}
