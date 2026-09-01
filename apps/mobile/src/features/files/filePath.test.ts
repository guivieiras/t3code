import { describe, expect, it } from "vite-plus/test";

import {
  isAudioPreviewFile,
  isBrowserPreviewFile,
  isImagePreviewFile,
  isSvgImagePreviewFile,
  resolveWorkspaceRelativeFilePath,
} from "./filePath";

describe("resolveWorkspaceRelativeFilePath", () => {
  it("keeps normalized workspace-relative paths", () => {
    expect(resolveWorkspaceRelativeFilePath("/repo", "./src/../src/main.ts")).toBe("src/main.ts");
  });

  it("converts absolute paths inside the workspace", () => {
    expect(
      resolveWorkspaceRelativeFilePath("/Users/julius/repo", "/Users/julius/repo/src/main.ts"),
    ).toBe("src/main.ts");
    expect(resolveWorkspaceRelativeFilePath("C:\\repo", "c:\\repo\\src\\main.ts")).toBe(
      "src/main.ts",
    );
  });

  it("rejects paths outside the workspace", () => {
    expect(resolveWorkspaceRelativeFilePath("/repo", "/other/main.ts")).toBeNull();
    expect(resolveWorkspaceRelativeFilePath("/repo", "../other/main.ts")).toBeNull();
    expect(resolveWorkspaceRelativeFilePath(null, "/repo/main.ts")).toBeNull();
  });
});

describe("file preview types", () => {
  it("recognizes audio, browser, and image previews", () => {
    expect(isAudioPreviewFile("audio/effect.OGG?download=1")).toBe(true);
    expect(isAudioPreviewFile("audio/effect.ogg.ts")).toBe(false);
    expect(isBrowserPreviewFile("reports/summary.html")).toBe(true);
    expect(isImagePreviewFile("assets/icon.png")).toBe(true);
    expect(isImagePreviewFile("assets/diagram.SVG?raw=1")).toBe(true);
    expect(isImagePreviewFile("src/image.ts")).toBe(false);
  });

  it("identifies SVG images that need web rendering", () => {
    expect(isSvgImagePreviewFile("assets/diagram.svg#icon")).toBe(true);
    expect(isSvgImagePreviewFile("assets/photo.png")).toBe(false);
  });
});
