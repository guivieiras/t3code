import { describe, expect, it } from "vite-plus/test";

import { attachmentImagePreviewId, workspaceImagePreviewId } from "./ExpandedImagePreview";
import {
  collectThreadImageSources,
  resolveThreadImageGallery,
  type ThreadImageSource,
} from "./ThreadImageGallery.logic";

describe("collectThreadImageSources", () => {
  it("collects uploaded and workspace images across thread messages", () => {
    expect(
      collectThreadImageSources(
        [
          {
            attachments: [
              {
                id: "upload-1",
                name: "upload.png",
                previewUrl: "blob:upload-1",
              },
              {
                id: "annotation-1",
                name: "preview-annotation-1.png",
                previewUrl: "blob:annotation-1",
              },
            ],
            text: [
              "[First](images/first.png)",
              "`/repo/images/second.webp`",
              "```md",
              "[Ignored](images/ignored.png)",
              "```",
            ].join("\n"),
          },
          {
            text: "[First again](images/first.png) and [not media](src/index.ts)",
          },
        ],
        "/repo",
      ),
    ).toEqual([
      {
        kind: "resolved",
        id: attachmentImagePreviewId("upload-1"),
        name: "upload.png",
        src: "blob:upload-1",
      },
      {
        kind: "workspace",
        id: workspaceImagePreviewId("/repo/images/first.png"),
        name: "repo/images/first.png",
        path: "/repo/images/first.png",
      },
      {
        kind: "workspace",
        id: workspaceImagePreviewId("/repo/images/second.webp"),
        name: "repo/images/second.webp",
        path: "/repo/images/second.webp",
      },
    ]);
  });
});

describe("resolveThreadImageGallery", () => {
  it("keeps thread order, preserves the selected fresh URL, and resolves the other paths", () => {
    const firstId = attachmentImagePreviewId("upload-1");
    const selectedId = workspaceImagePreviewId("/repo/images/selected.png");
    const lastId = workspaceImagePreviewId("/repo/images/last.png");
    const sources: ThreadImageSource[] = [
      { kind: "resolved", id: firstId, name: "upload.png", src: "blob:upload-1" },
      {
        kind: "workspace",
        id: selectedId,
        name: "images/selected.png",
        path: "/repo/images/selected.png",
      },
      {
        kind: "workspace",
        id: lastId,
        name: "images/last.png",
        path: "/repo/images/last.png",
      },
    ];

    expect(
      resolveThreadImageGallery({
        sources,
        workspaceUrlById: new Map([
          [selectedId, "https://environment.test/api/assets/token/selected.png"],
          [lastId, "https://environment.test/api/assets/token/last.png"],
        ]),
        preview: {
          images: [{ id: selectedId, name: "images/selected.png", src: "fresh-selected" }],
          index: 0,
        },
        cacheBuster: "gallery-open",
      }),
    ).toEqual({
      images: [
        { id: firstId, name: "upload.png", src: "blob:upload-1" },
        { id: selectedId, name: "images/selected.png", src: "fresh-selected" },
        {
          id: lastId,
          name: "images/last.png",
          src: "https://environment.test/api/assets/token/last.png?t3-preview=gallery-open",
        },
      ],
      index: 1,
    });
  });
});
