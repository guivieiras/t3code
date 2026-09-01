import { describe, expect, it } from "vite-plus/test";

import { attachVideoThumbnail, buildExpandedVideoPreview } from "./ExpandedVideoPreview";

describe("buildExpandedVideoPreview", () => {
  it("builds a blob preview for a local video", () => {
    const file = new File([new Uint8Array([1, 2, 3])], "demo.mp4", { type: "video/mp4" });

    const preview = buildExpandedVideoPreview(file);

    expect(preview.name).toBe("demo.mp4");
    expect(preview.src).toMatch(/^blob:/);
    URL.revokeObjectURL(preview.src);
  });

  it("releases a video thumbnail URL when detached", async () => {
    const video = { src: "" } as HTMLVideoElement;
    const file = new File([new Uint8Array([1, 2, 3])], "demo.mp4", { type: "video/mp4" });

    const detach = attachVideoThumbnail(video, file);
    const url = video.src;

    expect((await fetch(url)).ok).toBe(true);
    detach();
    await expect(fetch(url)).rejects.toThrow();
  });
});
