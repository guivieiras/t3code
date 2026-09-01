import { memo, useCallback, useEffect, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import type { ExpandedImagePreview } from "./ExpandedImagePreview";

interface ExpandedImageDialogProps {
  preview: ExpandedImagePreview;
  onClose: () => void;
}

export const ExpandedImageDialog = memo(function ExpandedImageDialog({
  preview,
  onClose,
}: ExpandedImageDialogProps) {
  const [selectedImageId, setSelectedImageId] = useState<string | null>(
    () => preview.images[preview.index]?.id ?? preview.images[0]?.id ?? null,
  );
  const selectedIndex = preview.images.findIndex((image) => image.id === selectedImageId);
  const index =
    selectedIndex >= 0 ? selectedIndex : Math.min(preview.index, preview.images.length - 1);

  const navigateImage = useCallback(
    (direction: -1 | 1) => {
      setSelectedImageId((currentId) => {
        const currentIndex = preview.images.findIndex((image) => image.id === currentId);
        const startIndex = currentIndex >= 0 ? currentIndex : preview.index;
        const nextIndex = (startIndex + direction + preview.images.length) % preview.images.length;
        return preview.images[nextIndex]?.id ?? currentId;
      });
    },
    [preview.images, preview.index],
  );

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (preview.images.length <= 1) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopPropagation();
        navigateImage(-1);
        return;
      }
      if (event.key !== "ArrowRight") return;
      event.preventDefault();
      event.stopPropagation();
      navigateImage(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigateImage, onClose, preview.images.length]);

  const item = preview.images[index];
  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 px-4 py-6 [-webkit-app-region:no-drag]"
      role="dialog"
      aria-modal="true"
      aria-label="Expanded image preview"
    >
      <button
        type="button"
        className="absolute inset-0 z-0 cursor-zoom-out"
        aria-label="Close image preview"
        onClick={onClose}
      />
      <div className="relative isolate z-10 flex max-h-[94vh] max-w-[94vw] flex-col items-center gap-2">
        <div className="relative flex h-[min(72vh,720px)] w-[min(92vw,1100px)] shrink-0 items-center justify-center">
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="absolute right-2 top-2 z-20 bg-black/45 text-white hover:bg-black/65 hover:text-white"
            onClick={onClose}
            aria-label="Close image preview"
          >
            <XIcon />
          </Button>
          <img
            key={item.id}
            src={item.src}
            alt={item.name}
            className="h-full w-full select-none rounded-lg border border-border/70 bg-background object-contain shadow-2xl"
            draggable={false}
          />
          {preview.images.length > 1 && (
            <>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="absolute left-2 top-1/2 z-20 -translate-y-1/2 bg-black/45 text-white hover:bg-black/65 hover:text-white"
                aria-label="Previous image"
                onClick={() => navigateImage(-1)}
              >
                <ChevronLeftIcon className="size-5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="absolute right-2 top-1/2 z-20 -translate-y-1/2 bg-black/45 text-white hover:bg-black/65 hover:text-white"
                aria-label="Next image"
                onClick={() => navigateImage(1)}
              >
                <ChevronRightIcon className="size-5" />
              </Button>
            </>
          )}
        </div>
        <p className="max-w-[92vw] truncate text-center text-xs text-white/75">
          {item.name}
          {preview.images.length > 1 ? ` (${index + 1}/${preview.images.length})` : ""}
        </p>
        {preview.images.length > 1 && (
          <div
            className="flex max-w-[92vw] gap-2 overflow-x-auto rounded-lg border border-white/10 bg-black/35 p-2 [scrollbar-color:color-mix(in_srgb,white_35%,transparent)_transparent] [scrollbar-width:thin]"
            role="list"
            aria-label="Thread images"
          >
            {preview.images.map((image, imageIndex) => (
              <button
                key={image.id}
                type="button"
                className={cn(
                  "shrink-0 overflow-hidden rounded-md border bg-black/40 p-0.5 transition-colors",
                  imageIndex === index
                    ? "border-white ring-1 ring-white/60"
                    : "border-white/15 opacity-65 hover:border-white/50 hover:opacity-100",
                )}
                aria-label={`View ${image.name}`}
                aria-current={imageIndex === index ? "true" : undefined}
                onClick={() => setSelectedImageId(image.id)}
              >
                <img
                  src={image.src}
                  alt=""
                  className="size-14 select-none rounded object-cover sm:size-16"
                  draggable={false}
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
