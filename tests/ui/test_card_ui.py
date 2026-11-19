"""Card UI tests: the dashboard card and its editors in a real browser.

Home Assistant runs here with its real frontend and the integration's fake
subwoofers; a headless Chrome (driven by driver.mjs) opens it, and
page_tests.js exercises the SVS Subwoofer card, the panel card and their
editors with Home Assistant's own components. Screenshots of every finish,
in the light and the dark scheme, are saved for review.

This file runs inside a checkout of the SVS Subwoofer integration (it is
copied into its tests folder by the workflow), so it uses the integration's
own test fixtures. SVS_CARD is the path of the card file to serve.
"""

from __future__ import annotations

import asyncio
import json
import os
from datetime import timedelta
from pathlib import Path

from homeassistant.auth.models import TOKEN_TYPE_LONG_LIVED_ACCESS_TOKEN
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.svs_subwoofer.const import (
    CONF_ENTRY_TYPE,
    CONF_MEMBERS,
    DOMAIN,
    ENTRY_TYPE_GROUP,
)

from .conftest import ADDRESS, FakeSubwoofer, SetupEntry, settle

HERE = Path(__file__).parent
ADDRESS_2 = "54:B7:E5:82:D1:E3"
CARD_URL = "/svs_card_test/svs-subwoofer-card.js"


async def test_card_ui(
    hass: HomeAssistant,
    hass_storage: dict,
    hass_admin_user,
    hass_client,
    sub: FakeSubwoofer,
    fake_subs: dict[str, FakeSubwoofer],
    setup_entry: SetupEntry,
) -> None:
    """The card and its editors work in Home Assistant's real frontend."""
    card = Path(os.environ["SVS_CARD"]).resolve()
    # Past onboarding, so the frontend opens the dashboard
    hass_storage["onboarding"] = {
        "version": 4,
        "minor_version": 1,
        "key": "onboarding",
        "data": {"done": ["user", "core_config", "analytics", "integration"]},
    }
    # A stored dashboard: only a dashboard page provides the card helpers
    # that editors load the tile card's editor with
    hass_storage["lovelace"] = {
        "version": 1,
        "minor_version": 1,
        "key": "lovelace",
        "data": {"config": {"views": [{"title": "Test", "path": "test", "cards": []}]}},
    }
    assert await async_setup_component(hass, "frontend", {})
    # The card, served the way HACS serves it: a plain file the page imports
    await hass.http.async_register_static_paths(
        [StaticPathConfig(CARD_URL, str(card), cache_headers=False)]
    )

    # Two subwoofers, Left and Right, and a group of both
    fake_subs[ADDRESS_2] = FakeSubwoofer()
    await setup_entry(name="Subwoofer Left")
    await setup_entry(address=ADDRESS_2, name="Subwoofer Right")
    group = MockConfigEntry(
        domain=DOMAIN,
        title="Subwoofer Both",
        data={CONF_ENTRY_TYPE: ENTRY_TYPE_GROUP},
        options={CONF_MEMBERS: [ADDRESS, ADDRESS_2]},
    )
    group.add_to_hass(hass)
    assert await hass.config_entries.async_setup(group.entry_id)
    await settle()

    client = await hass_client()
    url = str(client.make_url("/"))
    refresh = await hass.auth.async_create_refresh_token(
        hass_admin_user,
        client_name="SVS card UI tests",
        token_type=TOKEN_TYPE_LONG_LIVED_ACCESS_TOKEN,
        access_token_expiration=timedelta(days=1),
    )
    token = hass.auth.async_create_access_token(refresh)

    out = Path(os.environ.get("SVS_UI_OUT", "ui-results"))
    out.mkdir(parents=True, exist_ok=True)
    proc = await asyncio.create_subprocess_exec(
        "node",
        str(HERE / "driver.mjs"),
        url,
        token,
        str(out),
        str(HERE / "page_tests.js"),
        CARD_URL,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await asyncio.wait_for(proc.communicate(), 300)
    print(stdout.decode(), stderr.decode())

    report = json.loads((out / "report.json").read_text())
    failed = [r for r in report if not r["ok"]]
    assert not failed, "\n\n".join(f"{r['name']}:\n{r['detail']}" for r in failed)
