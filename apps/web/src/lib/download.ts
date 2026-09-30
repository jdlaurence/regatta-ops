// Save generated text (CSV exports, PLAN.md §4.11) as a file in the browser.

/** Offer `text` as a download named `filename`. */
export function downloadText(
  filename: string,
  text: string,
  type = 'text/csv;charset=utf-8',
): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before the URL goes away.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A file-name-safe slug: "Junior boys" → "junior-boys". */
export function fileSlug(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'export'
  );
}
