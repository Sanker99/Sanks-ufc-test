
#!/usr/bin/env python3
"""Collect official UFC fight-card placements.

Independent of the existing UFC statistics collector.
"""

import json
import re
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse

BASE = "https://www.ufc.com"
OUTPUT = Path("data/ufc-cards.json")


def fetch(url):
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "text/html",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode(
            "utf-8", errors="replace"
        )


class EventLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = set()

    def handle_starttag(self, tag, attrs):
        if tag != "a":
            return

        href = dict(attrs).get("href", "")
        parsed = urlparse(urljoin(BASE, href))

        if (
            parsed.netloc in ("ufc.com", "www.ufc.com")
            and parsed.path.startswith("/event/")
        ):
            self.urls.add(BASE + parsed.path.rstrip("/"))


def normalize_section(label):
    label = re.sub(r"\s+", " ", label.lower()).strip()

    if label in ("main card", "main"):
        return "main"

    if label in ("early prelims", "early preliminary card"):
        return "early_prelims"

    if label in ("prelims", "preliminary card"):
        return "prelims"

    return None


class FightParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.section = None
        self.heading_depth = None
        self.heading_text = ""
        self.current_fight = None
        self.name_corner = None
        self.name_depth = None
        self.fights = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = set(attrs.get("class", "").split())

        self.stack.append(tag)
        depth = len(self.stack)
        if attrs.get("id") == "main-card":
            self.section = "main"
        if "c-event-fight-card-broadcaster__card-title" in classes:
            self.heading_depth = depth
            self.heading_text = ""

        if "c-listing-fight" in classes:
            self.current_fight = {
                "section": self.section,
                "fighter1": "",
                "fighter2": "",
                "fight_id": attrs.get("data-fmid", ""),
            }
            self.fight_depth = depth

        if self.current_fight is not None:
            if "c-listing-fight__corner-name--red" in classes:
                self.name_corner = "fighter1"
                self.name_depth = depth

            elif "c-listing-fight__corner-name--blue" in classes:
                self.name_corner = "fighter2"
                self.name_depth = depth

    def handle_data(self, data):
        value = " ".join(data.split())

        if not value:
            return

        if self.heading_depth is not None:
            self.heading_text += " " + value

        if self.current_fight and self.name_corner:
            previous = self.current_fight[self.name_corner]
            self.current_fight[self.name_corner] = (
                previous + " " + value
            ).strip()

    def handle_endtag(self, tag):
        depth = len(self.stack)

        if (
            self.name_depth is not None
            and depth == self.name_depth
        ):
            self.name_corner = None
            self.name_depth = None

        if (
            self.heading_depth is not None
            and depth == self.heading_depth
        ):
            self.section = normalize_section(
                self.heading_text
            )
            self.heading_depth = None

        if (
            self.current_fight is not None
            and depth == self.fight_depth
        ):
            fight = self.current_fight

            if fight["fighter1"] and fight["fighter2"]:
                self.fights.append(fight)

            self.current_fight = None
            self.name_corner = None
            self.name_depth = None

        if self.stack:
            self.stack.pop()


def inspect_event(url):
    parser = FightParser()
    html = fetch(url)
    parser.feed(html)
    date_match = re.search(r'data-timestamp="(\d{10})"', html)
    event_date = datetime.fromtimestamp(int(date_match[1]), timezone.utc).isoformat() if date_match else None

    # Deduplicate using UFC's fight identifier.
    unique = {}
    for fight in parser.fights:
        key = fight["fight_id"] or (
            fight["fighter1"].lower(),
            fight["fighter2"].lower(),
        )
        if key not in unique:
            unique[key] = fight

    fights = list(unique.values())

    counts = {
        "main": 0,
        "prelims": 0,
        "early_prelims": 0,
        "unassigned": 0,
    }

    for fight in fights:
        section = fight["section"] or "unassigned"
        counts[section] += 1

    return {
        "url": url,
        "event": urlparse(url).path.split("/")[-1],
        "date": event_date,
        "counts": counts,
        "fights": fights,
    }


def main():
    print("Discovering official UFC events...")

    links = EventLinks()
    links.feed(fetch(BASE + "/events"))

    urls = sorted(links.urls)
    print(f"Found {len(urls)} event pages.")

    events = []

    for url in urls:
        try:
            event = inspect_event(url)
            events.append(event)

            counts = event["counts"]

            print(
                f"{event['event']}: "
                f"Main={counts['main']} | "
                f"Prelims={counts['prelims']} | "
                f"Early={counts['early_prelims']} | "
                f"Unassigned={counts['unassigned']}"
            )

        except Exception as error:
            print(f"ERROR {url}: {error}")
            events.append({
                "url": url,
                "error": str(error),
                "fights": [],
            })

    if not any(e.get('fights') and not e.get('error') for e in events):
        raise RuntimeError('No valid cards fetched; previous published cards preserved')
    previous = json.loads(OUTPUT.read_text(encoding='utf-8')) if OUTPUT.exists() else {}
    old = {e['url']: e for e in previous.get('events', [])}
    events = [{**old[e['url']], 'cached':True, 'last_error':e['error']} if e.get('error') and e['url'] in old else e for e in events]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    temporary=OUTPUT.with_suffix('.tmp')
    temporary.write_text(
        json.dumps({
            "source": BASE,
            "updated_at": datetime.now(
                timezone.utc
            ).isoformat(),
            "status": "placement_test",
            "events": events,
        }, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    temporary.replace(OUTPUT)
    print(f"Saved fight placements to {OUTPUT}")


if __name__ == "__main__":
    main()
