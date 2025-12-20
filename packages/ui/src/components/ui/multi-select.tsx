"use client";

import * as React from "react";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Badge } from "./badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select items...",
  searchPlaceholder = "Search...",
  emptyText = "No items found",
  className,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);

  const handleToggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const handleRemove = (value: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selected.filter((v) => v !== value));
  };

  const displayedItems = selected.slice(0, 3).map((value) => ({
    value,
    label: options.find((opt) => opt.value === value)?.label || value,
  }));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-start text-left font-normal h-auto min-h-10",
            !selected.length && "text-muted-foreground",
            className
          )}
        >
          {selected.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {displayedItems.map((item) => (
                <Badge
                  key={item.value}
                  variant="secondary"
                  className="mr-1"
                  onClick={(e: React.MouseEvent) => handleRemove(item.value, e)}
                >
                  {item.label}
                  <span className="ml-1 cursor-pointer hover:text-destructive">&times;</span>
                </Badge>
              ))}
              {selected.length > 3 && (
                <Badge variant="secondary">+{selected.length - 3} more</Badge>
              )}
            </div>
          ) : (
            placeholder
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selected.includes(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => handleToggle(option.value)}
                  >
                    <div
                      className={cn(
                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "opacity-50 [&_svg]:invisible"
                      )}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-3 w-3"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    {option.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
