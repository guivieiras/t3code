import type { ScopedThreadRef } from "@t3tools/contracts";
import { useMemo, useRef } from "react";

import { useAssetUrls } from "../../assets/assetUrls";
import { ExpandedImageDialog } from "./ExpandedImageDialog";
import type { ExpandedImagePreview } from "./ExpandedImagePreview";
import { resolveThreadImageGallery, type ThreadImageSource } from "./ThreadImageGallery.logic";

interface ThreadImageGalleryDialogProps {
  readonly preview: ExpandedImagePreview;
  readonly sources: ReadonlyArray<ThreadImageSource>;
  readonly threadRef: ScopedThreadRef;
  readonly onClose: () => void;
}

export function ThreadImageGalleryDialog({
  preview,
  sources,
  threadRef,
  onClose,
}: ThreadImageGalleryDialogProps) {
  const workspaceSources = useMemo(
    () => sources.filter((source) => source.kind === "workspace"),
    [sources],
  );
  const resources = useMemo(
    () =>
      workspaceSources.map((source) => ({
        _tag: "workspace-file" as const,
        threadId: threadRef.threadId,
        path: source.path,
      })),
    [threadRef.threadId, workspaceSources],
  );
  const workspaceUrls = useAssetUrls(threadRef.environmentId, resources);
  const cacheBusterRef = useRef(`${Date.now()}`);
  const workspaceUrlById = useMemo(
    () =>
      new Map(
        workspaceSources.flatMap((source, index) => {
          const url = workspaceUrls[index];
          return url ? [[source.id, url] as const] : [];
        }),
      ),
    [workspaceSources, workspaceUrls],
  );
  const resolvedPreview = useMemo(
    () =>
      resolveThreadImageGallery({
        sources,
        workspaceUrlById,
        preview,
        cacheBuster: cacheBusterRef.current,
      }),
    [preview, sources, workspaceUrlById],
  );

  return <ExpandedImageDialog preview={resolvedPreview} onClose={onClose} />;
}
