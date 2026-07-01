import { Input } from "./Input";

type DateRangePickerProps = {
  start?: string;
  end?: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
};

export function DateRangePicker({ start, end, onStartChange, onEndChange }: DateRangePickerProps) {
  return (
    <div className="date-range-picker">
      <Input type="date" value={start ?? ""} onChange={(event) => onStartChange(event.target.value)} />
      <Input type="date" value={end ?? ""} onChange={(event) => onEndChange(event.target.value)} />
    </div>
  );
}
