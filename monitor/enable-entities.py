#!/usr/bin/env python3
"""Re-enable entities that an integration disabled, via the HA websocket API.

The entity registry can't be edited over REST, and editing
/config/.storage/core.entity_registry while HA is running gets overwritten on
shutdown - so the websocket is the only safe route.

Usage: enable-entities.py <entity_id> [entity_id ...]
"""
import asyncio, json, os, sys, websockets

URL = os.environ["HA_URL"].replace("http://", "ws://").replace("https://", "wss://") + "/api/websocket"
TOKEN = os.environ["HA_TOKEN"]

async def main(entity_ids):
    async with websockets.connect(URL, max_size=None) as ws:
        await ws.recv()                                             # auth_required
        await ws.send(json.dumps({"type": "auth", "access_token": TOKEN}))
        if json.loads(await ws.recv())["type"] != "auth_ok":
            sys.exit("auth failed")
        i = 0
        for eid in entity_ids:
            i += 1
            await ws.send(json.dumps({
                "id": i, "type": "config/entity_registry/update",
                "entity_id": eid, "disabled_by": None,
            }))
            r = json.loads(await ws.recv())
            ok = r.get("success")
            print(f"  {'OK  ' if ok else 'FAIL'} {eid}"
                  + ("" if ok else f"  {r.get('error', {}).get('message', '')}"))

asyncio.run(main(sys.argv[1:]))
