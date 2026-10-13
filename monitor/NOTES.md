# Solar commissioning watch — 26 Aug 2026

## The system (from the Sunlight Future email thread)
- Installer: **Sunlight Future Ltd**, Create Centre, Bristol (contact@sunlightfuture.co.uk, Sam)
- **10 x JA Solar 460W** panels = 4.6 kWp (Aiko 465W were swapped out, unavailable)
- **Sigenergy SigenStor**, 3.6 kW hybrid inverter + **9 kWh** battery (upgraded from 6 kWh, +£400)
- G98 notification (not G99) — inverter is 3.6 kW

## Home Assistant readiness
- HA 2026.6.3 at 192.168.68.70, reachable on Tailscale at 100.95.190.82:8123
- Home LAN is a **TP-Link Deco**: 192.168.68.0/22, gateway 192.168.68.1
- `custom_components/sigen` = **Sigenergy Local Modbus v1.2.7.1** (TypQxQ) — already installed via HACS
- Config flow `sigen` verified working (no HA restart needed). Asks for:
  host, port (502), inverter_slave_ids (1), read_only (true), scan_interval (5)
- No `sigen` config entry exists yet.

## The blocker
Local Modbus TCP is **off by default** and needs the installer's login:
Sigen app > System > Devices > SigenStor > Operation > Parameter Settings >
Modbus Settings > enable **Local Modbus TCP** — and press Save (commonly missed).

Integration version check: v1.2.7.1 is the current upstream release (published 2026-08-24),
so nothing to update before commissioning.

Installer was not aware of the Modbus setting; said he would try it during commissioning.
Fallback if he cannot find it: the path varies by Sigen app version, and on some units
third-party/Modbus access has to be unlocked by Sigenergy support via the installer account.

## Baseline
Tom moved this Mac onto the house wifi, so discovery is now on-link (ARP, unprivileged).
`arp-baseline.txt` — ip/MAC of the 26 devices present before commissioning.
`sweep.sh` — ping-sweep 192.168.68-71.x, read back the ARP cache. No root needed
(`nmap -sn -PR` does need root, and sudo here is password-gated).

192.168.68.56 already has 502 open: it is a **Shelly** (Server: ShellyHTTP/1.0.0), not the
inverter. Pre-seeded into `seen-modbus.txt` so it is not flagged.

## Watch
`watch.sh` — every 45s:
- new MAC on the LAN; flagged as SIGENERGY-JOINED if the OUI is `0C:47:A9` or `BC:31:98`
  (the two prefixes the sigen integration's own DHCP matcher uses)
- any new host with 502 open
Pushes to ntfy topic `tomchambers-phone-hgzsxwk9kah`.


## Inverter identified (26 Aug, ~14:33)
**SigenStor = 192.168.68.76, MAC F8:5B:1B:0E:45:D4** (Espressif wifi module, not a
Sigenergy-registered OUI - so the OUI matcher would never have caught it).
Confirmed from the Sigen app's own WLAN page: same MAC, same IP, gateway 192.168.68.1,
mask 255.255.252.0.

The app showing live battery/solar figures proves **cloud** connectivity only - the
inverter reaching SigenCloud over the internet. It says nothing about local access.
As of 14:35 every TCP port on .76 is still filtered: 80, 502, 503, 7899, 8000, 8080.
So Local Modbus TCP is still **not** enabled, and HA still cannot read it.

`watch.sh` was retargeted at this point: it no longer sweeps the LAN, it tracks that one
MAC (following it if DHCP moves the IP) and polls 502 every 30s.

TODO once it works: give .76 a DHCP reservation on the Deco so the IP cannot move.

## Connected (26 Aug, 14:35)
Tom enabled Local Modbus TCP in the Sigen app; 502 opened within seconds.
`connect-ha.sh 192.168.68.76 true` created config entry `01M0Z4GEA50ZV8C1T4VG82W56H`
("Sigen Plant"), state=loaded, **74 entities**, all live.

First readings: PV 2.55 kW, battery charging 2.16 kW, SoC 43.2%, SoH 100%,
grid import 14 W, load 355 W, On Grid / Running, no alarms, EMS mode
"Maximum Self Consumption". Sanity check passes: 2.546 PV - 0.355 load = 2.19,
which matches the 2.156 kW going into the battery, so scaling is right.

Started **read_only=true**. To allow HA to control charge/discharge, reconfigure the
entry with read_only=false.

`watch.sh` has been stopped - it did its job. Left in place in case the setup ever
needs re-watching.

### Remaining
- DHCP reservation for 192.168.68.76 on the Deco, so the IP cannot move
- HA Energy dashboard not yet wired to these sensors
- tplink_deco integration still has no config entry (needs the owner TP-Link ID password)

## Read-write (26 Aug, ~14:45)
Options flow -> plant -> `read_only: false` (stored in
`data.plant_connection.read_only`; confirmed in `.storage/core.config_entries`).

**Gotcha:** flipping read_only is not enough. The integration registers all its
control entities at first setup and marks them `disabled_by: integration` while in
read-only mode. Reloading the entry does NOT re-enable them - HA never clears
`disabled_by` on its own. They have to be enabled through the entity registry, and
that is websocket-only (REST can't touch the registry, and editing
`.storage/core.entity_registry` while HA runs gets overwritten on shutdown).
`enable-entities.py` does this.

265 sigen entities exist in the registry; 188 were disabled. Enabled 11 - the battery
and grid-limit controls:
  switch.sigen_plant_remote_ems_controlled_by_home_assistant
  select.sigen_plant_remote_ems_control_mode
  number.sigen_plant_ess_max_charging_limit / _max_discharging_limit
  number.sigen_plant_active_power_fixed_adjustment / _percentage_adjustment
  number.sigen_plant_ess_backup_state_of_charge
  number.sigen_plant_ess_charge_cut_off_state_of_charge / _discharge_cut_off_...
  number.sigen_plant_grid_export_limitation / _import_limitation

**Deliberately left disabled:** all the grid-code entities (LVRT/HVRT, over/under
frequency derating) - those are G98 compliance and protection settings, not something
to expose to an automation. Also left off: switch.sigen_plant_plant_power and
switch.sigen_inverter_inverter_power, which shut the whole system down.

Notes on the values:
- `4294967.295 kW` on the limit numbers is 0xFFFFFFFF/1000, the "no limit" sentinel.
  Not a fault.
- `select.sigen_plant_remote_ems_control_mode` reads `unavailable` until the remote EMS
  switch is turned on.
- Remote EMS switch left **off**. Turning it on hands battery scheduling to HA and
  overrides the inverter's own "Maximum Self Consumption" mode.

## Dashboard + savings (26 Aug, ~15:15)
New Lovelace dashboard **"Energy"** at `/energy-home` (sidebar), three views:
Now / Savings / Usage. Built by `make-dashboard.py` (websocket - Lovelace lives in
.storage and cannot be created over REST). Re-running it overwrites the config in
place rather than duplicating the dashboard.

HA's built-in **Energy dashboard** is also wired now. Note HA 2026.x uses the
*unified* grid schema - `stat_energy_from`/`stat_energy_to` directly on the grid
source. The old `flow_from`/`flow_to` lists are rejected outright with
"extra keys not allowed". The script merges rather than replaces, so the two
existing `device_consumption` entries (kettle, eve energy) were preserved.

### Savings method
Savings are **not** modelled against a hypothetical house. The CT clamp measures
total house consumption and grid import as separate quantities, so:

    avoided import = daily_load_consumption - daily_grid_import_energy

is measured directly - the kWh the house used that did not come off the grid
(solar direct + battery discharge). Then:

    savings = avoided_import x import_rate + exported x export_rate

The **only** assumption is the unit rate. Set via `input_number.electricity_import_rate`
and `..._export_rate`, exposed at the top of the Savings view. Defaults 25p/15p are
placeholders - no tariff found in email, and no Octopus/Glow integration is
configured to supply live rates.

**Caveat:** if the battery is ever charged from the grid on a cheap rate, that import
lands in a different half-hour and this will overstate solar savings. Fine today
(remote EMS off, no grid charging), revisit if that changes.

New template sensors in configuration.yaml (backed up first to `backups/`):
  sensor.solar_avoided_import_today / _total
  sensor.solar_savings_today / _total
  sensor.solar_self_sufficiency_today
  sensor.house_total_power / _monitored_plug_power / _unaccounted_power

All use `availability:` guards rather than `| float(0)` defaults, so a dead source
shows unavailable instead of silently reading zero.

### Verified
`ha core check` = ok. All 30 entities referenced by the dashboard resolve.
`sensor.eve_energy_20ebt8601_power_2` and `sensor.home_assistant_plug_power` were
already offline before this work - they appear in the Metered devices list as
unavailable. Not visually eyeballed in a browser (would have meant typing the HA
password into one).

## Real tariff (26 Aug, from the E.ON Next bill)
Found in the bill Tom sent Sunlight Future (msg 19d913466cfc342d, attachment
A-F93D43BE-292967983-1.pdf, bill dated 22 Mar 2026):

  Supplier:        E.ON Next
  Tariff:          Next Fixed 12m v54 (fixed, Direct Debit)
  Electricity:     21.994 p/kWh **excluding VAT**; bill states VAT @ 5%
                   -> 23.09 p/kWh actually paid  <- this is what's in HA
  Standing charge: 50.150 p/day (GBP 183.05/yr)
  Price guaranteed until 21 May 2026
  Est. annual use: 3303.3 kWh (9.38 kWh/day average)
  Total export credits: GBP 0.00

**import rate = 23.09** (VAT-inclusive), **export rate = 0**.

Export is 0 on purpose, not as a placeholder: there is no SEG agreement yet, so
exported energy currently earns nothing. Can't get one until the MCS certificate
arrives from Sunlight Future. Set it the day an export tariff starts.

**Stale-rate warning:** the fix ran out 21 May 2026 and this bill is from March, so
23.09p is the best evidence available but is ~5 months old. Worth re-checking
against a current bill.

## Data retention
- **Long-term statistics: kept forever**, hourly, for any sensor with a state_class.
  All the sigen sensors and the new template sensors qualify.
- **Detailed history: 10 days** (recorder has no `purge_keep_days`, so HA's default
  applies). DB is already 931 MB, so raising it is a real trade-off.
- Modbus exposes only current values plus the inverter's own lifetime counters -
  there is no time series to pull. **HA is the historian**; history only accrues from
  today (26 Aug 2026) forward.

**Important limitation for long-run "what have I saved" analysis:**
`sensor.solar_savings_total` is computed from the *current* rate inputs, so changing
the rate retroactively rewrites the whole history. It is a live estimate, not a ledger.
The durable record is the **energy** in kWh - `solar_avoided_import_total`,
`sigen_plant_total_*` - which is rate-independent and exact. For a real payback
figure, apply the rates that were in force at the time to the kWh from that period.
If tariff changes are ever going to matter, log rate changes with dates.
