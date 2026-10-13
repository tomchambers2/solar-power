#!/usr/bin/env python3
"""Create/refresh the 'Energy' Lovelace dashboard and wire HA's Energy prefs.

Lovelace dashboards live in .storage and can't be created over REST, so this
goes through the websocket API. Re-running it overwrites the dashboard config
in place (it does not duplicate the dashboard).
"""
import asyncio, json, os, sys, websockets

URL = os.environ["HA_URL"].replace("http://", "ws://").replace("https://", "wss://") + "/api/websocket"
TOKEN = os.environ["HA_TOKEN"]
URL_PATH = "energy-home"

def tile(entity, name=None):
    c = {"type": "tile", "entity": entity}
    if name:
        c["name"] = name
    return c


PLUGS = [
    "sensor.0xa4c13801d1feffff_power",
    "sensor.0xa4c13802ac32ffff_power",
    "sensor.0xa4c13802ac57ffff_power",
    "sensor.bedroom_dehumidifier_power_monitor_power",
    "sensor.washing_machine_plug_power",
    "sensor.eve_energy_20ebt8601_power_2",
    "sensor.home_assistant_plug_power",
]

VIEWS = [
    {
        "title": "Now", "path": "now",
        "cards": [
            {"type": "grid", "columns": 2, "square": False, "cards": [
                tile("sensor.sigen_plant_pv_power", "Solar"),
                tile("sensor.sigen_plant_consumed_power", "House"),
                tile("sensor.sigen_plant_battery_power", "Battery"),
                tile("sensor.sigen_plant_grid_active_power", "Grid"),
            ]},
            {"type": "gauge", "entity": "sensor.sigen_plant_battery_state_of_charge",
             "name": "Battery", "min": 0, "max": 100,
             "severity": {"green": 60, "yellow": 25, "red": 0}},
            {"type": "history-graph", "hours_to_show": 24, "title": "Last 24 hours",
             "entities": [
                 {"entity": "sensor.sigen_plant_pv_power", "name": "Solar"},
                 {"entity": "sensor.sigen_plant_consumed_power", "name": "House"},
                 {"entity": "sensor.sigen_plant_battery_power", "name": "Battery"},
                 {"entity": "sensor.sigen_plant_grid_active_power", "name": "Grid"},
             ]},
        ],
    },
    {
        "title": "Payback", "path": "payback",
        "cards": [
            {"type": "gauge", "entity": "sensor.solar_paid_off", "name": "Paid off",
             "min": 0, "max": 100, "needle": True,
             "severity": {"green": 100, "yellow": 50, "red": 0}},
            {"type": "grid", "columns": 3, "square": False, "cards": [
                tile("sensor.solar_savings_cumulative", "Saved"),
                tile("sensor.solar_payback_remaining", "Remaining"),
                tile("sensor.solar_paid_off", "Paid off"),
            ]},
            {"type": "statistics-graph", "title": "Savings to date", "period": "day",
             "days_to_show": 3650, "chart_type": "line", "stat_types": ["max"],
             "entities": [{"entity": "sensor.solar_savings_cumulative", "name": "Cumulative"}]},
            {"type": "statistics-graph", "title": "Saved per month", "period": "month",
             "days_to_show": 3650, "chart_type": "bar", "stat_types": ["change"],
             "entities": [{"entity": "sensor.solar_savings_cumulative", "name": "Saved"}]},
            {"type": "grid", "columns": 3, "square": False, "cards": [
                tile("sensor.solar_savings_daily", "Today"),
                tile("sensor.solar_savings_monthly", "This month"),
                tile("sensor.solar_savings_yearly", "This year"),
            ]},
            {"type": "entities", "title": "Tariff", "entities": [
                {"entity": "input_number.electricity_import_peak_rate", "name": "Import peak"},
                {"entity": "input_number.electricity_import_offpeak_rate", "name": "Import offpeak"},
                {"entity": "input_number.electricity_export_peak_rate", "name": "Export peak"},
                {"entity": "input_number.electricity_export_offpeak_rate", "name": "Export offpeak"},
                {"entity": "input_number.battery_round_trip_assumed", "name": "Round trip"},
                {"entity": "input_number.solar_system_cost", "name": "System cost"},
            ]},
            {"type": "grid", "columns": 2, "square": False, "cards": [
                tile("sensor.export_wasted_value", "Given away avoidably"),
                tile("sensor.export_tariff_opportunity", "An export tariff would be worth"),
                tile("sensor.solar_export_avoidable", "Avoidable export"),
                tile("sensor.solar_export_unavoidable", "Unavoidable export"),
            ]},
            {"type": "entities", "title": "Export tariff", "entities": [
                {"entity": "input_number.seg_rate_hypothetical", "name": "If SEG paid"},
            ]},
        ],
    },
    {
        "title": "Decision", "path": "decision",
        "cards": [
            {"type": "grid", "columns": 2, "square": False, "cards": [
                tile("sensor.best_use_of_surplus", "Surplus belongs in"),
                tile("sensor.surplus_decision_margin", "By this margin"),
                tile("sensor.import_rate_now", "Import now"),
                tile("sensor.export_rate_now", "Export now"),
                tile("sensor.stored_energy_value", "A stored kWh is worth"),
                tile("select.grid_import_by_time_of_use", "Band"),
            ]},
            {"type": "history-graph", "hours_to_show": 48, "title": "Last 48 hours",
             "entities": [
                 {"entity": "sensor.import_rate_now", "name": "Import"},
                 {"entity": "sensor.export_rate_now", "name": "Export"},
                 {"entity": "sensor.stored_energy_value", "name": "Stored value"},
                 {"entity": "sensor.best_use_of_surplus", "name": "Decision"},
             ]},
            {"type": "entities", "title": "Bands", "entities": [
                {"entity": "automation.grid_import_tou_offpeak_starts", "name": "Offpeak from 00:30"},
                {"entity": "automation.grid_import_tou_peak_starts", "name": "Peak from 07:30"},
            ]},
        ],
    },
    {
        "title": "Energy", "path": "energy",
        "cards": [
            {"type": "grid", "columns": 2, "square": False, "cards": [
                tile("sensor.sigen_plant_solar_generation_monthly", "Generated this month"),
                tile("sensor.sigen_plant_solar_generation_yearly", "Generated this year"),
                tile("sensor.avoided_import_monthly", "Avoided this month"),
                tile("sensor.avoided_import_yearly", "Avoided this year"),
            ]},
            {"type": "statistics-graph", "title": "Daily energy", "period": "day",
             "days_to_show": 365, "chart_type": "bar", "stat_types": ["change"],
             "entities": [
                 {"entity": "sensor.sigen_plant_daily_pv_energy", "name": "Generated"},
                 {"entity": "sensor.sigen_plant_daily_load_consumption", "name": "Used"},
                 {"entity": "sensor.sigen_plant_daily_grid_import_energy", "name": "Imported"},
                 {"entity": "sensor.sigen_plant_daily_grid_export_energy", "name": "Exported"},
             ]},
            {"type": "entities", "title": "This month", "entities": [
                {"entity": "sensor.sigen_plant_house_consumption_monthly", "name": "Used"},
                {"entity": "sensor.sigen_plant_grid_import_monthly", "name": "Imported"},
                {"entity": "sensor.sigen_plant_grid_export_monthly", "name": "Exported"},
            ]},
        ],
    },
    {
        "title": "Time of use", "path": "tou",
        "cards": [
            {"type": "grid", "columns": 2, "square": False, "cards": [
                tile("sensor.sigen_plant_grid_import_by_time_of_use_offpeak", "Offpeak import"),
                tile("sensor.sigen_plant_grid_import_by_time_of_use_peak", "Peak import"),
            ]},
            {"type": "entities", "title": "Band", "entities": [
                {"entity": "select.grid_import_by_time_of_use", "name": "Now"},
                {"entity": "automation.grid_import_tou_offpeak_starts", "name": "Offpeak from 00:30"},
                {"entity": "automation.grid_import_tou_peak_starts", "name": "Peak from 07:30"},
            ]},
            {"type": "statistics-graph", "title": "Import by band", "period": "month",
             "days_to_show": 3650, "chart_type": "bar", "stat_types": ["change"],
             "entities": [
                 {"entity": "sensor.sigen_plant_grid_import_by_time_of_use_offpeak", "name": "Offpeak"},
                 {"entity": "sensor.sigen_plant_grid_import_by_time_of_use_peak", "name": "Peak"},
             ]},
        ],
    },
    {
        "title": "Health", "path": "health",
        "cards": [
            {"type": "grid", "columns": 2, "square": False, "cards": [
                tile("sensor.solar_specific_yield", "Yield per kWp"),
                tile("sensor.solar_utilisation", "Generation used"),
                tile("sensor.battery_round_trip_efficiency", "Battery efficiency"),
                tile("sensor.sigen_plant_battery_state_of_health", "Battery health"),
            ]},
            {"type": "entities", "title": "Status", "entities": [
                {"entity": "sensor.sigen_plant_plant_running_state", "name": "System"},
                {"entity": "sensor.sigen_plant_grid_connection_status", "name": "Grid"},
                {"entity": "sensor.sigen_plant_ems_work_mode", "name": "Mode"},
                {"entity": "sensor.sigen_inverter_pcs_internal_temperature", "name": "Inverter temp"},
                {"entity": "sensor.sigen_plant_general_alarm_1", "name": "Alarm 1"},
                {"entity": "sensor.sigen_plant_general_alarm_2", "name": "Alarm 2"},
            ]},
            {"type": "statistics-graph", "title": "String comparison", "period": "day",
             "days_to_show": 365, "chart_type": "bar", "stat_types": ["change"],
             "entities": [
                 {"entity": "sensor.sigen_inverter_pv1_daily_energy", "name": "String 1"},
                 {"entity": "sensor.sigen_inverter_pv2_daily_energy", "name": "String 2"},
             ]},
        ],
    },
    {
        "title": "Usage", "path": "usage",
        "cards": [
            {"type": "grid", "columns": 3, "square": False, "cards": [
                tile("sensor.house_total_power", "Total"),
                tile("sensor.house_monitored_plug_power", "Metered"),
                tile("sensor.house_unaccounted_power", "Unaccounted"),
            ]},
            {"type": "history-graph", "hours_to_show": 12, "title": "Last 12 hours",
             "entities": [
                 {"entity": "sensor.house_total_power", "name": "Total"},
                 {"entity": "sensor.house_monitored_plug_power", "name": "Metered"},
                 {"entity": "sensor.house_unaccounted_power", "name": "Unaccounted"},
             ]},
            {"type": "entities", "title": "Metered devices",
             "entities": [{"entity": p} for p in PLUGS]},
        ],
    },
]


# HA 2026.x uses the unified grid schema (stat_energy_from/to directly on the
# grid source). The old flow_from/flow_to lists are rejected outright.
ENERGY_SOURCES = [
    {"type": "grid",
     "stat_energy_from": "sensor.sigen_plant_daily_grid_import_energy",
     "stat_energy_to": "sensor.sigen_plant_daily_grid_export_energy",
     "stat_rate": "sensor.sigen_plant_grid_active_power",
     "cost_adjustment_day": 0.0},
    {"type": "solar",
     "stat_energy_from": "sensor.sigen_plant_daily_pv_energy",
     "stat_rate": "sensor.sigen_plant_pv_power"},
    {"type": "battery",
     "stat_energy_from": "sensor.sigen_plant_daily_battery_discharge_energy",
     "stat_energy_to": "sensor.sigen_plant_daily_battery_charge_energy",
     "stat_soc": "sensor.sigen_plant_battery_state_of_charge"},
]

async def call(ws, state, msg):
    state["id"] += 1
    msg["id"] = state["id"]
    await ws.send(json.dumps(msg))
    while True:
        r = json.loads(await ws.recv())
        if r.get("id") == state["id"]:
            return r

async def main():
    async with websockets.connect(URL, max_size=None) as ws:
        await ws.recv()
        await ws.send(json.dumps({"type": "auth", "access_token": TOKEN}))
        if json.loads(await ws.recv())["type"] != "auth_ok":
            sys.exit("auth failed")
        st = {"id": 0}

        existing = await call(ws, st, {"type": "lovelace/dashboards/list"})
        have = any(d.get("url_path") == URL_PATH for d in existing.get("result") or [])
        if not have:
            r = await call(ws, st, {"type": "lovelace/dashboards/create",
                                    "url_path": URL_PATH, "title": "Energy",
                                    "icon": "mdi:solar-power-variant", "show_in_sidebar": True,
                                    "require_admin": False})
            print("create dashboard:", "OK" if r.get("success") else r.get("error"))
        else:
            print("create dashboard: already exists, updating config")

        r = await call(ws, st, {"type": "lovelace/config/save", "url_path": URL_PATH,
                                "config": {"views": VIEWS}})
        print("save config:", "OK" if r.get("success") else r.get("error"))

        cur = (await call(ws, st, {"type": "energy/get_prefs"})).get("result") or {}
        prefs = {"type": "energy/save_prefs", "energy_sources": ENERGY_SOURCES,
                 "device_consumption": cur.get("device_consumption", [])}
        if "device_consumption_water" in cur:
            prefs["device_consumption_water"] = cur["device_consumption_water"]
        r = await call(ws, st, prefs)
        print("energy prefs:", "OK" if r.get("success") else r.get("error"))

asyncio.run(main())
