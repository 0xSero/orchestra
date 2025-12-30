export function TemperatureSlider(props: { value: number; onChange: (v: number) => void }) {
  return (
    <label class="flex flex-col gap-2 text-xs text-muted-foreground">
      <span class="font-medium text-foreground">Temperature</span>
      <div class="flex items-center gap-3">
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={props.value}
          onInput={(e) => props.onChange(Number(e.currentTarget.value))}
          class="flex-1"
        />
        <span class="text-xs text-foreground w-8 text-right">{props.value.toFixed(1)}</span>
      </div>
    </label>
  );
}
