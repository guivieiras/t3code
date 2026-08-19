import { memo, useEffect } from "react";
import { XIcon } from "lucide-react";

import { Button } from "../ui/button";
import type { ExpandedAudioPreview } from "./ExpandedAudioPreview";

interface ExpandedAudioDialogProps {
  preview: ExpandedAudioPreview;
  onClose: () => void;
}

export const ExpandedAudioDialog = memo(function ExpandedAudioDialog({
  preview,
  onClose,
}: ExpandedAudioDialogProps) {
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
      aria-label="Audio preview"
    >
      <button
        type="button"
        className="absolute inset-0 z-0 cursor-default"
        aria-label="Close audio preview"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-xl rounded-lg border border-border/70 bg-background p-5 shadow-2xl">
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          className="absolute right-2 top-2"
          onClick={onClose}
          aria-label="Close audio preview"
        >
          <XIcon />
        </Button>
        <p className="mb-4 truncate pr-8 text-sm text-foreground">{preview.name}</p>
        <audio
          className="w-full"
          src={preview.src}
          aria-label={`Audio preview: ${preview.name}`}
          controls
          autoPlay
          preload="metadata"
        />
      </div>
    </div>
  );
});
