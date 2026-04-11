"use client";

interface ShadowSimProps {
  month: number;
  hour: number;
  onMonthChange: (month: number) => void;
  onHourChange: (hour: number) => void;
  sunAltitudeDeg: number | null;
  sunAzimuthDeg: number | null;
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default function ShadowSim({
  month,
  hour,
  onMonthChange,
  onHourChange,
  sunAltitudeDeg,
  sunAzimuthDeg,
}: ShadowSimProps) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="font-semibold text-gray-800 mb-2">Shadow Simulation</h3>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-gray-600 block mb-1">
            Month: {MONTH_LABELS[month]}
          </label>
          <input
            type="range"
            min={0}
            max={11}
            value={month}
            onChange={(e) => onMonthChange(parseInt(e.target.value))}
            className="w-full"
          />
        </div>

        <div>
          <label className="text-xs text-gray-600 block mb-1">
            Time: {hour.toString().padStart(2, "0")}:00
          </label>
          <input
            type="range"
            min={5}
            max={21}
            value={hour}
            onChange={(e) => onHourChange(parseInt(e.target.value))}
            className="w-full"
          />
        </div>

        {sunAltitudeDeg !== null && sunAzimuthDeg !== null && (
          <div className="text-xs text-gray-600 space-y-1 border-t pt-2">
            <p>
              Sun altitude:{" "}
              <span className={sunAltitudeDeg <= 0 ? "text-red-500" : "text-green-600"}>
                {sunAltitudeDeg.toFixed(1)}°
              </span>
              {sunAltitudeDeg <= 0 && " (below horizon)"}
            </p>
            <p>Sun azimuth: {sunAzimuthDeg.toFixed(1)}°</p>
          </div>
        )}
      </div>
    </div>
  );
}
