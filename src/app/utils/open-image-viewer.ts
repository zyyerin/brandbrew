export function getImageViewerUrl(imageUrl: string, title = "Image"): string {
  const params = new URLSearchParams({ src: imageUrl, title });
  // Keep the remote image URL in the fragment so it is not sent to Netlify.
  return `/image-viewer.html#${params.toString()}`;
}

/**
 * Opens a same-origin viewer page that embeds the remote image.
 * This avoids browsers treating a direct cross-origin media navigation as a download.
 */
export function openImageInNewTab(imageUrl: string, title = "Image"): boolean {
  if (!imageUrl) return false;
  return window.open(
    getImageViewerUrl(imageUrl, title),
    "_blank",
    "noopener,noreferrer",
  ) !== null;
}
