#!/usr/bin/env python3
"""Derive the real unit rate and standing charge from the smart meter.

The Hildebrand Glow DCC integration reports actual billed cost and usage per
day. cost = rate*usage + standing is two unknowns, so a least-squares fit over
many days recovers both - no bill needed, and it stays right when the tariff
changes.

Prints the result; pass --set to write the rate into HA.
"""
import argparse, asyncio, datetime, json, os, sys, urllib.request
import websockets

IDS = ["sensor.dcc_sourced_smart_electricity_meter_cost_today",
       "sensor.dcc_sourced_smart_electricity_meter_usage_today"]


async def daily(days):
    url = os.environ["HA_URL"].replace("http://", "ws://").replace("https://", "wss://") + "/api/websocket"
    async with websockets.connect(url, max_size=None) as ws:
        await ws.recv()
        await ws.send(json.dumps({"type": "auth", "access_token": os.environ["HA_TOKEN"]}))
        if json.loads(await ws.recv())["type"] != "auth_ok":
            sys.exit("auth failed")
        start = (datetime.datetime.now(datetime.UTC) - datetime.timedelta(days=days)).isoformat()
        # these sensors reset daily, so 'state' (last value in the day) is the
        # day's total. 'change' would straddle the reset and go negative.
        await ws.send(json.dumps({"id": 1, "type": "recorder/statistics_during_period",
                                  "start_time": start, "statistic_ids": IDS,
                                  "period": "day", "types": ["state"]}))
        while True:
            r = json.loads(await ws.recv())
            if r.get("id") == 1:
                return r["result"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=90)
    ap.add_argument("--set", action="store_true", help="write the rate into HA")
    args = ap.parse_args()

    res = asyncio.run(daily(args.days))
    day = lambda x: datetime.datetime.fromtimestamp(x["start"] / 1000, datetime.UTC).date()
    cost = {day(x): x.get("state") for x in res.get(IDS[0], [])}
    use = {day(x): x.get("state") for x in res.get(IDS[1], [])}
    pts = [(use[d], cost[d]) for d in sorted(set(cost) & set(use))
           if use.get(d) and cost.get(d) and use[d] > 0.05]
    if len(pts) < 5:
        sys.exit(f"only {len(pts)} usable days - need more history")

    n = len(pts)
    sx = sum(p[0] for p in pts); sy = sum(p[1] for p in pts)
    sxy = sum(p[0] * p[1] for p in pts); sxx = sum(p[0] ** 2 for p in pts)
    den = n * sxx - sx * sx
    if den == 0:
        sys.exit("all days have identical usage - cannot separate rate from standing charge")
    rate = (n * sxy - sx * sy) / den
    standing = (sy - rate * sx) / n
    rms = (sum((c - (rate * u + standing)) ** 2 for u, c in pts) / n) ** 0.5

    print(f"{n} days")
    print(f"  unit rate       {rate * 100:.3f} p/kWh")
    print(f"  standing charge {standing * 100:.2f} p/day")
    print(f"  residual RMS    GBP {rms:.4f}/day")
    if rms > 0.10:
        print("  WARNING: poor fit. A tariff change mid-window will do this - "
              "narrow --days to a single tariff period.")

    if args.set:
        req = urllib.request.Request(
            os.environ["HA_URL"] + "/api/services/input_number/set_value",
            data=json.dumps({"entity_id": "input_number.electricity_import_rate",
                             "value": round(rate * 100, 3)}).encode(),
            headers={"Authorization": "Bearer " + os.environ["HA_TOKEN"],
                     "Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=20)
        print(f"  -> set input_number.electricity_import_rate = {rate * 100:.3f}")


if __name__ == "__main__":
    main()
