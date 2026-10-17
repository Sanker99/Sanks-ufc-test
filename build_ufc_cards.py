
#!/usr/bin/env python3
"""Collect official UFC fight-card placement data.

This first version discovers official event pages and saves their
URLs for the next parsing stage. It does not guess fight placement.
"""

import json
import re
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse

BASE = "https://www.ufc.com"
EVENTS_URL = BASE + "/events"
OUTPUT = Path("data/ufc-cards.json")


class EventLinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = set()

    def handle_starttag(self, tag, attrs):
        if tag != "a":
            return

        attributes = dict(attrs)
        href = attributes.get("href", "")
        url = urljoin(BASE, href)
        parsed = urlparse(url)

        if (
            parsed.netloc == "www.ufc.com"
            and parsed.path.startswith("/event/")
        ):
            self.links.add(
                BASE + parsed.path.rstrip("/")
            )


def fetch_html(url):
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 SanksResearchLab/1.0",
            "Accept": "text/html",
        },
    )

    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def main():
    print("Discovering official UFC event pages...")

    html = fetch_html(EVENTS_URL)
    parser = EventLinkParser()
    parser.feed(html)

    events = sorted(parser.links)

    if not events:
        raise RuntimeError(
            "No UFC event links found. "
            "The source page may have changed."
        )

    result = {
        "source": EVENTS_URL,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "status": "discovery_only",
        "events": [
            {
                "url": url,
                "placements": {},
            }
            for url in events
        ],
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(result, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print(f"Discovered {len(events)} event pages.")
    print(f"Saved {OUTPUT}")


if __name__ == "__main__":
    main()
