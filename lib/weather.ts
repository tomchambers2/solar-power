export interface MonthlyRadiation {
  month: number;
  label: string;
  radiationKwhM2: number;
}

export async function fetchSolarRadiation(
  lat: number,
  lng: number
): Promise<MonthlyRadiation[]> {
  const endDate = "2024-12-31";
  const startDate = "2024-01-01";

  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${startDate}&end_date=${endDate}&daily=shortwave_radiation_sum&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const dailyRadiation: number[] = data.daily.shortwave_radiation_sum;
  const dates: string[] = data.daily.time;

  const monthLabels = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  // Aggregate daily radiation into monthly totals (MJ/m2 -> kWh/m2)
  // Open-Meteo returns shortwave_radiation_sum in MJ/m2 per day
  const monthlyTotals = new Array(12).fill(0);
  const monthlyCounts = new Array(12).fill(0);

  for (let i = 0; i < dates.length; i++) {
    const month = new Date(dates[i]).getMonth();
    if (dailyRadiation[i] != null) {
      // Convert MJ/m2 to kWh/m2: 1 MJ = 0.2778 kWh
      monthlyTotals[month] += dailyRadiation[i] * 0.2778;
      monthlyCounts[month]++;
    }
  }

  return monthLabels.map((label, i) => ({
    month: i,
    label,
    radiationKwhM2: monthlyTotals[i],
  }));
}
