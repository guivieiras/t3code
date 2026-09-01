import type { ChatImageAttachment } from "../../types";

export interface ExpandedImageItem {
  id: string;
  src: string;
  name: string;
}

export interface ExpandedImagePreview {
  images: ExpandedImageItem[];
  index: number;
}

export function attachmentImagePreviewId(attachmentId: string): string {
  return `attachment:${attachmentId}`;
}

export function workspaceImagePreviewId(filePath: string): string {
  return `workspace:${filePath}`;
}

export function addMediaPreviewCacheBuster(assetUrl: string, cacheBuster: string): string {
  const url = new URL(assetUrl);
  url.searchParams.set("t3-preview", cacheBuster);
  return url.toString();
}

export function buildExpandedImagePreview(
  images: ReadonlyArray<ChatImageAttachment>,
  selectedImageId: string,
): ExpandedImagePreview | null {
  const previewableImages = images.flatMap((image) =>
    image.type === "image" && image.previewUrl
      ? [{ id: image.id, src: image.previewUrl, name: image.name }]
      : [],
  );
  if (previewableImages.length === 0) {
    return null;
  }
  const selectedIndex = previewableImages.findIndex((image) => image.id === selectedImageId);
  if (selectedIndex < 0) {
    return null;
  }
  return {
    images: previewableImages.map((image) => ({
      id: attachmentImagePreviewId(image.id),
      src: image.src,
      name: image.name,
    })),
    index: selectedIndex,
  };
}
