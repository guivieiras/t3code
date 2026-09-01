export interface ExpandedVideoPreview {
  src: string;
  name: string;
}

export function buildExpandedVideoPreview(file: File): ExpandedVideoPreview {
  return {
    src: URL.createObjectURL(file),
    name: file.name,
  };
}

export function attachVideoThumbnail(video: HTMLVideoElement, file: File): () => void {
  const url = URL.createObjectURL(file);
  video.src = url;
  return () => URL.revokeObjectURL(url);
}
