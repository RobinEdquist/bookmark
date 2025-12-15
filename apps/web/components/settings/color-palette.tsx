'use client';

import { cn } from '@repo/ui/lib/utils';

interface ColorSwatchProps {
  color: string;
  name: string;
  isSelected: boolean;
  onClick: () => void;
}

function ColorSwatch({ color, name, isSelected, onClick }: ColorSwatchProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={name}
      className={cn(
        'h-8 w-8 rounded-full transition-all duration-150',
        'hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        isSelected && 'ring-2 ring-foreground ring-offset-2 ring-offset-background',
      )}
      style={{ backgroundColor: `hsl(${color})` }}
      aria-label={`Select ${name} color`}
      aria-pressed={isSelected}
    />
  );
}

interface ColorPaletteProps<T extends string> {
  colors: Record<T, { hsl: string; name: string } | { name: string; vars: { background: string } }>;
  selected: T;
  onChange: (color: T) => void;
  label: string;
}

export function ColorPalette<T extends string>({
  colors,
  selected,
  onChange,
  label,
}: ColorPaletteProps<T>) {
  return (
    <div className="space-y-3">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(colors) as T[]).map((key) => {
          const color = colors[key];
          const hsl = 'hsl' in color ? color.hsl : color.vars.background;
          return (
            <ColorSwatch
              key={key}
              color={hsl}
              name={color.name}
              isSelected={selected === key}
              onClick={() => onChange(key)}
            />
          );
        })}
      </div>
    </div>
  );
}
