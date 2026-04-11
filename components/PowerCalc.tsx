"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { MonthlyRadiation, fetchSolarRadiation } from "@/lib/weather";
import {
  estimateMonthlyPower,
  estimateAnnualPower,
  estimateCO2Savings,
} from "@/lib/solar";
import { PanelType } from "@/lib/panels";

interface PowerCalcProps {
  lat: number | null;
  lng: number | null;
  panelCount: number;
  panelType: PanelType;
}

interface MonthlyPowerData {
  month: string;
  kWh: number;
}

export default function PowerCalc({
  lat,
  lng,
  panelCount,
  panelType,
}: PowerCalcProps) {
  const [radiation, setRadiation] = useState<MonthlyRadiation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lat === null || lng === null) return;

    setLoading(true);
    setError(null);
    fetchSolarRadiation(lat, lng)
      .then((data) => {
        setRadiation(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [lat, lng]);

  if (lat === null || lng === null) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-semibold text-gray-800 mb-2">Power Estimation</h3>
        <p className="text-sm text-gray-500">
          Search for an address to see power estimates.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-semibold text-gray-800 mb-2">Power Estimation</h3>
        <p className="text-sm text-gray-500">Loading solar radiation data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-semibold text-gray-800 mb-2">Power Estimation</h3>
        <p className="text-sm text-red-500">Error: {error}</p>
      </div>
    );
  }

  if (!radiation || panelCount === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-semibold text-gray-800 mb-2">Power Estimation</h3>
        <p className="text-sm text-gray-500">
          {panelCount === 0
            ? "Place panels on the roof to see power estimates."
            : "No radiation data available."}
        </p>
      </div>
    );
  }

  const panelAreaM2 = panelType.widthM * panelType.heightM;

  const monthlyData: MonthlyPowerData[] = radiation.map((r) => ({
    month: r.label,
    kWh: Math.round(
      estimateMonthlyPower(
        panelCount,
        panelType.wattage,
        r.radiationKwhM2,
        panelType.efficiency,
        panelAreaM2
      )
    ),
  }));

  const totalAnnualRadiation = radiation.reduce(
    (sum, r) => sum + r.radiationKwhM2,
    0
  );

  const annualKwh = estimateAnnualPower(
    panelCount,
    panelType.wattage,
    totalAnnualRadiation,
    panelType.efficiency,
    panelAreaM2
  );

  const co2Savings = estimateCO2Savings(annualKwh);

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="font-semibold text-gray-800 mb-3">Power Estimation</h3>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-blue-50 rounded p-3">
          <p className="text-xs text-blue-600">Annual Generation</p>
          <p className="text-lg font-bold text-blue-800">
            {Math.round(annualKwh).toLocaleString()} kWh
          </p>
        </div>
        <div className="bg-green-50 rounded p-3">
          <p className="text-xs text-green-600">CO2 Saved/Year</p>
          <p className="text-lg font-bold text-green-800">
            {Math.round(co2Savings).toLocaleString()} kg
          </p>
        </div>
        <div className="bg-amber-50 rounded p-3">
          <p className="text-xs text-amber-600">Total Capacity</p>
          <p className="text-lg font-bold text-amber-800">
            {((panelCount * panelType.wattage) / 1000).toFixed(1)} kWp
          </p>
        </div>
        <div className="bg-purple-50 rounded p-3">
          <p className="text-xs text-purple-600">Panel Count</p>
          <p className="text-lg font-bold text-purple-800">{panelCount}</p>
        </div>
      </div>

      <h4 className="text-sm font-medium text-gray-700 mb-2">
        Monthly Generation (kWh)
      </h4>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="kWh" fill="#f59e0b" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
