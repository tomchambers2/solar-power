#!/usr/bin/env python3
"""Create the payback ledger + utility meters as HA UI helpers.

Deliberately NOT YAML: the `integration` sensor platform and `utility_meter`
only build at startup and cannot be reloaded, and restarting core disrupts the
house. As config entries they appear under
Settings > Devices & Services > Helpers - which is also where someone hunting
for them in five years would actually look.

Idempotent: skips any helper whose title already exists.
"""
import json, os, sys, urllib.request

BASE = os.environ["HA_URL"]
TOKEN = os.environ["HA_TOKEN"]


def api(path, payload=None, method=None):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"},
        method=method or ("POST" if payload is not None else "GET"))
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read().decode()
        return json.loads(body) if body else {}


# The ledger: integrating GBP/h gives a running total that accrues at the rate
# in force AT THE TIME, so a later tariff change cannot rewrite history.
def integ(name, source, rnd=4):
    return ("integration", {
        "name": name, "source": source, "method": "trapezoidal",
        "unit_time": "h", "round": rnd,
        "max_sub_interval": {"hours": 0, "minutes": 5, "seconds": 0},
    })


HELPERS = [
    integ("Solar Savings Cumulative", "sensor.solar_savings_rate"),
    # Surplus that was given away while the battery still had room (should stay
    # near zero - anything else means the EMS is not doing its job), versus
    # surplus given away with a full battery, which is what an SEG export
    # tariff would actually be worth.
    integ("Solar Export Avoidable", "sensor.solar_export_avoidable_power", 3),
    integ("Solar Export Unavoidable", "sensor.solar_export_unavoidable_power", 3),
]

def meter(name, source, cycle, tariffs=None):
    return ("utility_meter", {
        "name": name, "source": source, "cycle": cycle, "offset": 0,
        "tariffs": tariffs or [], "net_consumption": False,
        "delta_values": False, "periodically_resetting": True,
        "always_available": False,
    })

# Time-of-use import. Hourly statistics cannot resolve a half-hourly tariff, so
# bucket the energy into the right price band AS IT IS MEASURED - then the
# resolution of the stored history stops mattering.
HELPERS.append(meter("Grid Import by Time of Use",
                     "sensor.sigen_plant_daily_grid_import_energy", "none",
                     ["peak", "offpeak"]))

for name, src, cycle in [
    ("Solar Generation Monthly",   "sensor.sigen_plant_daily_pv_energy",              "monthly"),
    ("Solar Generation Yearly",    "sensor.sigen_plant_daily_pv_energy",              "yearly"),
    ("Grid Import Monthly",        "sensor.sigen_plant_daily_grid_import_energy",     "monthly"),
    ("Grid Export Monthly",        "sensor.sigen_plant_daily_grid_export_energy",     "monthly"),
    ("House Consumption Monthly",  "sensor.sigen_plant_daily_load_consumption",       "monthly"),
    ("Avoided Import Monthly",     "sensor.solar_avoided_import_today",               "monthly"),
    ("Avoided Import Yearly",      "sensor.solar_avoided_import_today",               "yearly"),
    # Sourced from the integration LEDGER, not from energy x today's rate, so
    # these stay correct across tariff changes and under time-of-use pricing.
    ("Solar Savings Daily",        "sensor.solar_savings_cumulative",                 "daily"),
    ("Solar Savings Monthly",      "sensor.solar_savings_cumulative",                 "monthly"),
    ("Solar Savings Yearly",       "sensor.solar_savings_cumulative",                 "yearly"),
]:
    HELPERS.append(meter(name, src, cycle))


def main():
    have = {(e["domain"], e["title"]) for e in api("/api/config/config_entries/entry")}
    for domain, opts in HELPERS:
        if (domain, opts["name"]) in have:
            print(f"  skip  {domain}: {opts['name']}")
            continue
        flow = api("/api/config/config_entries/flow",
                   {"handler": domain, "show_advanced_options": True})
        fid = flow.get("flow_id")
        if not fid:
            print(f"  FAIL  {domain}: {opts['name']} -> {flow}")
            continue
        res = api(f"/api/config/config_entries/flow/{fid}", opts)
        ok = res.get("type") == "create_entry"
        if not ok:
            api(f"/api/config/config_entries/flow/{fid}", method="DELETE")
        print(f"  {'OK  ' if ok else 'FAIL'} {domain}: {opts['name']}"
              + ("" if ok else f" -> {json.dumps(res)[:400]}"))


if __name__ == "__main__":
    main()
