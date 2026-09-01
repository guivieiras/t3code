import { memo, useEffect } from "react";
import { XIcon } from "lucide-react";

import { Button } from "../ui/button";
import type { ExpandedVideoPreview } from "./ExpandedVideoPreview";

interface ExpandedVideoDialogProps {
  preview: ExpandedVideoPreview;
  onClose: () => void;
}

export const ExpandedVideoDialog = memo(function ExpandedVideoDialog({
  preview,
  onClose,
}: ExpandedVideoDialogProps) {
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6 [-webkit-app-region:no-drag]"
      role="dialog"
      aria-modal="true"
      aria-label="Video preview"
    >
      <button
        type="button"
        className="absolute inset-0 z-0 cursor-default"
        aria-label="Close video preview"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[92vh] max-w-[92vw] flex-col rounded-lg border border-border/70 bg-background p-3 shadow-2xl">
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          className="absolute right-4 top-4 z-10 bg-background/70"
          onClick={onClose}
          aria-label="Close video preview"
        >
          <XIcon />
        </Button>
        <video
          className="max-h-[82vh] max-w-[88vw] rounded-md bg-black"
          src={preview.src}
          aria-label={`Video preview: ${preview.name}`}
          controls
          autoPlay
          preload="metadata"
        />
        <p className="mt-2 max-w-[88vw] truncate text-center text-xs text-muted-foreground/80">
          {preview.name}
        </p>
      </div>
    </div>
  );
});
