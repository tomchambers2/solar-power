"use client";

import { PanelType, PANEL_TYPES } from "@/lib/panels";

interface PanelSelectorProps {
  selectedPanel: PanelType;
  onSelect: (panel: PanelType) => void;
}

export default function PanelSelector({
  selectedPanel,
  onSelect,
}: PanelSelectorProps) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="font-semibold text-gray-800 mb-2">Panel Type</h3>
      <select
        value={selectedPanel.id}
        onChange={(e) => {
          const panel = PANEL_TYPES.find((p) => p.id === e.target.value);
          if (panel) onSelect(panel);
        }}
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-800"
      >
        {PANEL_TYPES.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <div className="mt-2 text-xs text-gray-600 space-y-1">
        <p className="font-medium text-gray-700">{selectedPanel.manufacturer} {selectedPanel.model}</p>
        <p>
          Size: {(selectedPanel.heightM * 1000).toFixed(0)}mm x {(selectedPanel.widthM * 1000).toFixed(0)}mm
        </p>
        <p>Power: {selectedPanel.wattage}W</p>
        <p>Efficiency: {(selectedPanel.efficiency * 100).toFixed(1)}%</p>
        <p>Area: {(selectedPanel.widthM * selectedPanel.heightM).toFixed(2)} m&sup2;</p>
      </div>
    </div>
  );
}
