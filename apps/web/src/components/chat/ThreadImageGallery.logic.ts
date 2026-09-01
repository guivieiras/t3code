import { isWorkspaceImagePreviewPath } from "@t3tools/shared/filePreview";

import {
  normalizeMarkdownLinkDestination,
  resolveInlineCodeFileLinkMeta,
  resolveMarkdownFileLinkMeta,
  rewriteMarkdownFileUriHref,
  type MarkdownFileLinkMeta,
} from "../../markdown-links";
import {
  addMediaPreviewCacheBuster,
  attachmentImagePreviewId,
  type ExpandedImageItem,
  type ExpandedImagePreview,
  workspaceImagePreviewId,
} from "./ExpandedImagePreview";

export type ThreadImageSource =
  | {
      readonly kind: "resolved";
      readonly id: string;
      readonly name: string;
      readonly src: string;
    }
  | {
      readonly kind: "workspace";
      readonly id: string;
      readonly name: string;
      readonly path: string;
    };

interface ThreadImageMessage {
  readonly text: string;
  readonly attachments?:
    | ReadonlyArray<{
        readonly type: string;
        readonly id: string;
        readonly name: string;
        readonly previewUrl?: string | undefined;
      }>
    | undefined;
}

const MARKDOWN_LINK_HREF_PATTERN = /\[[^\]]*]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
const FENCED_CODE_SEGMENT_PATTERN = /(```[\s\S]*?(?:```|$))/;
const INLINE_CODE_SPAN_PATTERN = /`([^`\n]+)`/g;

function workspaceImageMeta(meta: MarkdownFileLinkMeta | null): MarkdownFileLinkMeta | null {
  return meta !== null &&
    meta.workspaceRelativePath !== null &&
    isWorkspaceImagePreviewPath(meta.filePath)
    ? meta
    : null;
}

function extractWorkspaceImageMetas(text: string, cwd: string | undefined): MarkdownFileLinkMeta[] {
  const metas: MarkdownFileLinkMeta[] = [];
  const segments = text.split(FENCED_CODE_SEGMENT_PATTERN);
  for (let index = 0; index < segments.length; index += 2) {
    const segment = segments[index] ?? "";
    for (const match of segment.matchAll(MARKDOWN_LINK_HREF_PATTERN)) {
      const rawHref = match[1]?.trim();
      if (!rawHref) continue;
      const normalizedHref = normalizeMarkdownLinkDestination(rawHref);
      const meta = workspaceImageMeta(
        resolveMarkdownFileLinkMeta(
          rewriteMarkdownFileUriHref(normalizedHref) ?? normalizedHref,
          cwd,
        ),
      );
      if (meta) metas.push(meta);
    }
    for (const match of segment.matchAll(INLINE_CODE_SPAN_PATTERN)) {
      const candidate = match[1]?.trim();
      if (!candidate) continue;
      const meta = workspaceImageMeta(resolveInlineCodeFileLinkMeta(candidate, cwd));
      if (meta) metas.push(meta);
    }
  }
  return metas;
}

export function collectThreadImageSources(
  messages: ReadonlyArray<ThreadImageMessage>,
  cwd: string | undefined,
): ThreadImageSource[] {
  const sources: ThreadImageSource[] = [];
  const seenIds = new Set<string>();
  const add = (source: ThreadImageSource) => {
    if (seenIds.has(source.id)) return;
    seenIds.add(source.id);
    sources.push(source);
  };

  for (const message of messages) {
    for (const attachment of message.attachments ?? []) {
      if (
        attachment.type !== "image" ||
        !attachment.previewUrl ||
        attachment.name.startsWith("preview-annotation-")
      ) {
        continue;
      }
      add({
        kind: "resolved",
        id: attachmentImagePreviewId(attachment.id),
        name: attachment.name,
        src: attachment.previewUrl,
      });
    }
    for (const meta of extractWorkspaceImageMetas(message.text, cwd)) {
      add({
        kind: "workspace",
        id: workspaceImagePreviewId(meta.filePath),
        name: meta.displayPath,
        path: meta.filePath,
      });
    }
  }
  return sources;
}

export function resolveThreadImageGallery(input: {
  readonly sources: ReadonlyArray<ThreadImageSource>;
  readonly workspaceUrlById: ReadonlyMap<string, string>;
  readonly preview: ExpandedImagePreview;
  readonly cacheBuster: string;
}): ExpandedImagePreview {
  const previewItemById = new Map(input.preview.images.map((image) => [image.id, image] as const));
  const images: ExpandedImageItem[] = [];
  const addedIds = new Set<string>();

  for (const source of input.sources) {
    const previewItem = previewItemById.get(source.id);
    if (previewItem) {
      images.push(previewItem);
      addedIds.add(previewItem.id);
      continue;
    }
    const src =
      source.kind === "resolved"
        ? source.src
        : input.workspaceUrlById.has(source.id)
          ? addMediaPreviewCacheBuster(input.workspaceUrlById.get(source.id)!, input.cacheBuster)
          : null;
    if (!src) continue;
    images.push({ id: source.id, name: source.name, src });
    addedIds.add(source.id);
  }

  for (const previewItem of input.preview.images) {
    if (addedIds.has(previewItem.id)) continue;
    images.push(previewItem);
  }

  const selectedItem = input.preview.images[input.preview.index] ?? input.preview.images[0];
  const selectedIndex = selectedItem
    ? images.findIndex((image) => image.id === selectedItem.id)
    : -1;
  return {
    images,
    index: selectedIndex >= 0 ? selectedIndex : 0,
  };
}
