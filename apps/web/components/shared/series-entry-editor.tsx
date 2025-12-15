"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { CreatableSelect } from "@repo/ui/components/ui/creatable-select";
import { useSeriesOptions } from "../../lib/use-series";

export interface SeriesEntry {
  seriesName: string;
  order: string;
}

interface SeriesEntryEditorProps {
  value: SeriesEntry[];
  onChange: (entries: SeriesEntry[]) => void;
  disabled?: boolean;
  labels: {
    series: string;
    addSeries: string;
    order: string;
    orderPlaceholder: string;
    searchSeries: string;
    noSeriesFound: string;
    createSeries: string;
    removeSeries: string;
  };
}

export function SeriesEntryEditor({
  value,
  onChange,
  disabled,
  labels,
}: SeriesEntryEditorProps) {
  const { data: existingSeries = [] } = useSeriesOptions();

  const seriesOptions = existingSeries.map((s) => s.name);

  const handleAddEntry = () => {
    onChange([...value, { seriesName: "", order: "" }]);
  };

  const handleRemoveEntry = (index: number) => {
    const newEntries = value.filter((_, i) => i !== index);
    onChange(newEntries);
  };

  const handleSeriesChange = (index: number, seriesName: string) => {
    const newEntries = [...value];
    const existing = newEntries[index];
    if (existing) {
      newEntries[index] = { seriesName, order: existing.order };
    }
    onChange(newEntries);
  };

  const handleOrderChange = (index: number, order: string) => {
    const newEntries = [...value];
    const existing = newEntries[index];
    if (existing) {
      newEntries[index] = { seriesName: existing.seriesName, order };
    }
    onChange(newEntries);
  };

  return (
    <div className="space-y-2">
      <Label>{labels.series}</Label>

      {value.length > 0 && (
        <div className="space-y-2">
          {value.map((entry, index) => (
            <div key={index} className="flex items-center gap-2">
              <div className="flex-1">
                <CreatableSelect
                  options={seriesOptions}
                  value={entry.seriesName}
                  onChange={(name) => handleSeriesChange(index, name)}
                  placeholder={labels.searchSeries}
                  searchPlaceholder={labels.searchSeries}
                  emptyText={labels.noSeriesFound}
                  createText={labels.createSeries}
                  disabled={disabled}
                />
              </div>
              <div className="w-24">
                <Input
                  type="text"
                  inputMode="decimal"
                  value={entry.order}
                  onChange={(e) => handleOrderChange(index, e.target.value)}
                  placeholder={labels.orderPlaceholder}
                  disabled={disabled}
                  className="text-center"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleRemoveEntry(index)}
                disabled={disabled}
                className="h-9 w-9 shrink-0"
                title={labels.removeSeries}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAddEntry}
        disabled={disabled}
        className="w-full"
      >
        <Plus className="mr-2 h-4 w-4" />
        {labels.addSeries}
      </Button>
    </div>
  );
}
