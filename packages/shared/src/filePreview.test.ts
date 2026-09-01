import { describe, expect, it } from "vite-plus/test";

import {
  isWorkspaceAudioPreviewPath,
  isWorkspaceBrowserPreviewPath,
  isWorkspaceImagePreviewPath,
  isWorkspacePreviewEntryPath,
  isWorkspaceVideoPreviewPath,
} from "./filePreview.ts";

describe("workspace file previews", () => {
  it.each([
    "sound.aac",
    "sound.flac",
    "sound.m4a",
    "sound.mp3",
    "sound.oga",
    "sound.OGG?download=1",
    "sound.opus",
    "sound.wav",
    "sound.weba",
  ])("recognizes audio preview path %s", (path) => {
    expect(isWorkspaceAudioPreviewPath(path)).toBe(true);
    expect(isWorkspacePreviewEntryPath(path)).toBe(true);
  });

  it.each(["report.html", "report.HTM", "document.pdf?download=1"])(
    "recognizes browser preview path %s",
    (path) => {
      expect(isWorkspaceBrowserPreviewPath(path)).toBe(true);
      expect(isWorkspacePreviewEntryPath(path)).toBe(true);
    },
  );

  it.each([
    "icon.png",
    "photo.JPEG",
    "animation.gif",
    "vector.svg#mark",
    "texture.webp",
    "image.avif",
  ])("recognizes image preview path %s", (path) => {
    expect(isWorkspaceImagePreviewPath(path)).toBe(true);
    expect(isWorkspacePreviewEntryPath(path)).toBe(true);
  });

  it.each(["clip.m4v", "clip.MOV", "clip.mp4?download=1", "clip.ogv", "clip.webm"])(
    "recognizes video preview path %s",
    (path) => {
      expect(isWorkspaceVideoPreviewPath(path)).toBe(true);
      expect(isWorkspacePreviewEntryPath(path)).toBe(true);
    },
  );

  it.each(["README.md", "src/index.ts", "image.png.ts", "audio.ogg.ts", "video.mp4.ts", "png"])(
    "rejects non-preview path %s",
    (path) => {
      expect(isWorkspacePreviewEntryPath(path)).toBe(false);
    },
  );
});
