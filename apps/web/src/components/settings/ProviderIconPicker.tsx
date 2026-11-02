import { CheckIcon } from "lucide-react";
import { useState } from "react";
import type { ProviderDriverKind } from "@t3tools/contracts";
import { MODEL_BRAND_ICON_OPTIONS } from "@t3tools/client-runtime/model-brand-icons";

import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { cn } from "../../lib/utils";

const DRIVER_DEFAULT_OPTION = { key: undefined, label: "Driver default" } as const;
const ICON_OPTIONS = [DRIVER_DEFAULT_OPTION, ...MODEL_BRAND_ICON_OPTIONS];

/** Picks the instance icon; an empty commit restores the driver icon. */
export function ProviderIconPicker(props: {
  readonly driverKind: ProviderDriverKind;
  readonly displayName: string;
  readonly value: string | undefined;
  readonly onCommit: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected =
    ICON_OPTIONS.find((option) => option.key === props.value) ?? DRIVER_DEFAULT_OPTION;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="icon-sm"
            variant="ghost-muted"
            aria-label={`Icon for ${props.displayName}: ${selected.label}`}
          />
        }
      >
        <ProviderInstanceIcon
          driverKind={props.driverKind}
          displayName={props.displayName}
          iconKey={selected.key}
          className="size-4"
          iconClassName="size-4"
        />
      </PopoverTrigger>
      <PopoverPopup side="bottom" align="start" sideOffset={6} padding="compact" className="w-60">
        <div className="grid grid-cols-5 gap-1" role="listbox" aria-label="Provider icon">
          {ICON_OPTIONS.map((option) => {
            const isSelected = option.key === selected.key;
            return (
              <button
                key={option.key ?? "default"}
                type="button"
                role="option"
                aria-selected={isSelected}
                aria-label={option.label}
                className={cn(
                  "relative flex aspect-square cursor-pointer items-center justify-center rounded-md border border-transparent hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  isSelected && "border-primary/40 bg-primary/10",
                )}
                onClick={() => {
                  props.onCommit(option.key ?? "");
                  setOpen(false);
                }}
              >
                <ProviderInstanceIcon
                  driverKind={props.driverKind}
                  displayName={props.displayName}
                  iconKey={option.key}
                  className="size-6"
                  iconClassName="size-5"
                />
                {isSelected ? (
                  <span className="absolute right-0.5 bottom-0.5 grid size-3.5 place-items-center rounded-full bg-primary text-primary-foreground">
                    <CheckIcon className="size-2.5" aria-hidden />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
