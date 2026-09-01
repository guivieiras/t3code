"use client";

import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import type { ProviderDriverKind } from "@t3tools/contracts";

import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { CURATED_PROVIDER_ICON_OPTIONS } from "../chat/providerIconUtils";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { cn } from "../../lib/utils";

const DEFAULT_ICON_OPTION = { key: undefined, label: "Driver default" } as const;

export function ProviderIconPicker(props: {
  readonly driverKind: ProviderDriverKind;
  readonly displayName: string;
  readonly value: string | undefined;
  readonly onCommit: (value: string) => void;
  readonly description?: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedOption =
    CURATED_PROVIDER_ICON_OPTIONS.find((option) => option.key === props.value) ??
    DEFAULT_ICON_OPTION;

  const selectIcon = (iconKey: string | undefined) => {
    props.onCommit(iconKey ?? "");
    setOpen(false);
  };

  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-medium text-foreground">Icon</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              className="h-9 w-full justify-between bg-background px-3 font-normal"
              aria-label={`Choose an icon for ${props.displayName}`}
            />
          }
        >
          <span className="flex min-w-0 items-center gap-2">
            <ProviderInstanceIcon
              driverKind={props.driverKind}
              displayName={props.displayName}
              iconKey={selectedOption.key}
              className="size-4"
              iconClassName="size-4"
            />
            <span className="truncate text-xs">{selectedOption.label}</span>
          </span>
          <ChevronDownIcon className="size-3.5 text-muted-foreground" aria-hidden />
        </PopoverTrigger>
        <PopoverPopup align="start" sideOffset={6} className="w-72 p-2">
          <div className="grid grid-cols-5 gap-1" role="listbox" aria-label="Provider icon">
            {[DEFAULT_ICON_OPTION, ...CURATED_PROVIDER_ICON_OPTIONS].map((option) => {
              const selected = option.key === selectedOption.key;
              return (
                <button
                  key={option.key ?? "default"}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  aria-label={option.label}
                  className={cn(
                    "relative flex aspect-square cursor-pointer items-center justify-center rounded-md border border-transparent text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected && "border-primary/40 bg-primary/10",
                  )}
                  onClick={() => selectIcon(option.key)}
                >
                  <ProviderInstanceIcon
                    driverKind={props.driverKind}
                    displayName={props.displayName}
                    iconKey={option.key}
                    className="size-7"
                    iconClassName="size-6"
                  />
                  {selected ? (
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
      {props.description ? (
        <span className="text-[11px] text-muted-foreground">{props.description}</span>
      ) : null}
    </div>
  );
}
