# Solar payback — how it's built

Everything lives in **Home Assistant**. Nothing runs on the Mac, no CSVs, no cron.
The two scripts here only *provision* HA; they are not part of running it.

Dashboard: **Energy** in the sidebar (`/energy-home`, icon mdi:solar-power-variant)
— tabs: Now, Payback, Decision, Energy, Time of use, Health, Usage.

> Views carry no `icon`. HA renders a view tab's icon if it has one and its
> title only if it does not — so setting icons leaves every tab unlabelled.

## The ledger, and why it works

`sensor.solar_savings_rate` is money-per-hour right now. An **integration
helper** (Riemann sum) turns that into `sensor.solar_savings_cumulative`.

That matters: the running total accrues at whatever rate was in force **at the
time**. Change the tariff in five years and history stays correct. Contrast
`sensor.solar_savings_total`, which recomputes everything from the current rate
input — fine as a live dashboard number, useless as a ledger.

`sensor.solar_paid_off` = cumulative / `input_number.solar_system_cost` × 100.
The Payback view charts it over 10 years.

`sensor.solar_savings_daily` / `_monthly` / `_yearly` are utility_meters sourced
from the **ledger**, not from energy × today's rate, so they stay correct across
tariff changes and under time-of-use pricing. The old `solar_savings_today` /
`solar_savings_total` template sensors were deleted for exactly that reason.

## Half-hourly

HA long-term statistics are **hourly, forever**, and that is not configurable.
5-minute statistics and raw history purge after ~10 days.

Hourly cannot resolve a half-hourly tariff. The fix is not to store finer data —
it is to **bucket the energy into the right price band as it is measured**, so
resolution stops mattering. `utility_meter` with tariffs does exactly this:
`select.grid_import_by_time_of_use` is flipped peak/offpeak by two automations
(offpeak 00:30, peak 07:30), and the meter keeps separate lifetime totals.

Change the times when the tariff changes; energy already banked stays correct.

## Why helpers, not YAML

The `integration` and `utility_meter` YAML platforms only build at startup and
cannot be reloaded, and restarting core disrupts the house. As config entries
they appear under **Settings → Devices & Services → Helpers** — which is also
where someone hunting for them in five years would actually look.

## Scripts

| file | what |
|---|---|
| `make-helpers.py` | Creates the integration + utility_meter helpers. Idempotent. |
| `make-dashboard.py` | Writes the dashboard config and HA's Energy prefs. Idempotent — re-running overwrites in place, it does not duplicate. |
| `system.json` | Spec and cost, for reference. The live figure is `input_number.solar_system_cost`. |

Both need `HA_URL` and `HA_TOKEN`; source `../../home-assistant/.env` first.

## The tariff — from the bill, not from the smart meter

`input_number.electricity_import_*_rate` = **26.385 p/kWh** (E.ON Next Flex,
25.129p ex VAT x 1.05), standing charge 57.89 p/day inc VAT. From the statement
for 21 Jul - 20 Aug 2026, forwarded 26 Aug.

Rate history, ex VAT, from the statements:

    21 Feb - 21 May 2026   21.994   Next Fixed 12m v54 (fix expired)
    21 - 30 Jun 2026       23.776   Next Flex
    1 Jul 2026 onwards     25.129   Next Flex

He is now on **Next Flex — variable, no price guarantee, no exit fee.**

### Do NOT derive the tariff from the Glow smart meter (`derive-tariff.py`)

Least-squares over the Glow `cost_today` vs `usage_today` series gave 23.087
p/kWh with a residual RMS of GBP 0.0029/day — a near-perfect fit that matched
the *expired* fixed-rate bill to three decimals. Both looked like corroboration.
Both were wrong. The real rate was 26.385p.

Two separate faults, and only one of them was Glow's:

**1. The usage shortfall was a bucketing bug in the analysis, not bad data.**
`usage_today` resets at the meter's LOCAL midnight. Bucketing it into UTC days
during BST clips the last hour off every day — and that hour is the evening
peak, so the loss is far worse than 1/24. Re-bucketed into Europe/London days
(taking each day's peak, since the sensor resets):

    UTC days, last value:    175.3 kWh   -13.1% vs bill
    London days, day peak:   209.5 kWh    +3.8% vs bill

+3.8% is just meter-read timing — the bill period runs between readings taken
at some hour of the day, not at local midnight. **Glow's usage is sound.**

**2. The cost figure is genuinely wrong: the meter holds a stale tariff.**
Regressing correctly bucketed days across the 21 Jul - 20 Aug bill period:

    meter's stored unit rate        22.939 p/kWh   (expired fix was 23.094 inc VAT)
    meter's stored standing charge 106.92  p/day   (actual bill: 57.89 inc VAT)
    Glow cost GBP 81.21 vs bill GBP 71.19

The meter is still pricing against the **fixed tariff that expired on 21 May** —
it never received the Next Flex update over the DCC. Its stored standing charge
is also roughly double the real one. This is a display fault only: E.ON bills
from meter *readings*, not from the meter's cost register, and the statement is
correct. But it makes `cost_today` unusable, and it is why the in-home display
will read high.

Lesson: a tight regression fit measures self-consistency, not accuracy, and two
sources agreeing means nothing when one is a stale document and the other is
pricing against the same stale document. **Bills are authoritative.**

`derive-tariff.py` is kept only for spotting *changes*; never use it to set a
rate, and if it is ever used again it must bucket by Europe/London, not UTC.

### Worth acting on

The statement itself says the cheapest tariff is **Next Pledge Tracker 12m v12**,
saving GBP 32.90/yr on electricity, and **Next Secure Fixed 24m v41** saving
GBP 33.48/yr on gas. Next Flex has **no exit fee**, so switching is free.

## The tariff model is general, not fitted to today

Everything is modelled as **time-of-use with an export price, always**. A flat
tariff with no export is simply the degenerate case where both bands hold the
same number and export is zero. There is no "current situation" special case to
unpick later.

    input_number.electricity_import_peak_rate      23.087
    input_number.electricity_import_offpeak_rate   23.087
    input_number.electricity_export_peak_rate       0
    input_number.electricity_export_offpeak_rate    0
    input_number.battery_round_trip_assumed        90

`sensor.import_rate_now` / `sensor.export_rate_now` resolve the live band from
`select.grid_import_by_time_of_use`, and **every downstream sensor prices against
those, never against a fixed input**. The day an export tariff or a TOU plan
starts: fill in the four numbers, adjust the two band automations if the times
differ, done. The ledger keeps accruing correctly across the change because it
integrates money-per-hour at the rate in force at the time.

> Entity ids come from a template sensor's `name`, not its `unique_id`.
> "Import Rate Now" becomes `sensor.import_rate_now`. Getting this wrong makes
> every dependent sensor go `unavailable` with no other clue.

### The storage-vs-export decision

A stored kWh is worth the import it will later displace, discounted by round-trip
losses, benchmarked against the **peak** import rate because that is when stored
energy gets used:

    sensor.stored_energy_value      = import_peak_rate x round_trip
    sensor.surplus_decision_margin  = stored_energy_value - export_rate_now
    sensor.best_use_of_surplus      = "Battery" if margin > 0 else "Grid"

Today: stored 20.778p vs export 0p, so **Battery**, by 20.778p/kWh. That is also
exactly what the inverter's own Maximum Self Consumption mode does, so there is
nothing to gain from taking control yet — the value of this is that it will
**flip on its own** when an export tariff makes exporting worth more, and the
Decision view will show it.

### Measuring the regret

| sensor | meaning |
|---|---|
| `sensor.solar_export_avoidable` | exported while the battery had room AND storing was worth more — should stay near zero; anything else is a misconfiguration losing real money |
| `sensor.solar_export_unavoidable` | exported with a full battery, or when exporting was genuinely the better call |
| `sensor.export_wasted_value` | avoidable export x the decision margin — the value actually forgone |
| `sensor.export_tariff_opportunity` | unavoidable export x `input_number.seg_rate_hypothetical` — what an SEG tariff would have paid |

The last one is the number that tells you what chasing the MCS certificate is worth.
