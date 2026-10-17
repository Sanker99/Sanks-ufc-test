
#!/usr/bin/env python3
"""Inspect UFC event HTML to locate fight-card sections.

Diagnostic only: does not publish fight placements.
"""

import json
import re
import urllib.request
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse

BASE = "https://www.ufc.com"
OUTPUT = Path("data/ufc-cards.json")

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

def clean(value):
    value = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", unescape(value)).strip()

def inspect(url):
    html = fetch(url)

    # Capture the actual markup around fight listings.
    matches = list(re.finditer(
        r"c-listing-fight",
        html,
        flags=re.IGNORECASE,
    ))

    fight_samples = []
    for match in matches[:5]:
        start = max(0, match.start() - 1800)
        end = min(len(html), match.end() + 5500)
        fight_samples.append({
            "position": match.start(),
            "html": html[start:end],
        })

    # Capture HTML surrounding each card section label.
    section_samples = []
    for match in re.finditer(
        r"Main Card|Early Prelims|Prelims",
        html,
        flags=re.IGNORECASE,
    ):
        start = max(0, match.start() - 1200)
        end = min(len(html), match.end() + 1800)

        section_samples.append({
            "label": match.group(),
            "position": match.start(),
            "html": html[start:end],
        })

        if len(section_samples) >= 12:
            break

    return {
        "url": url,
        "fight_marker_count": len(matches),
        "fight_samples": fight_samples,
        "section_samples": section_samples,
        "placements": {},
    }

def main():
    print("Discovering UFC event pages...")

    parser = EventLinks()
    parser.feed(fetch(BASE + "/events"))
    urls = sorted(parser.urls)

    print(f"Found {len(urls)} event pages.")

    results = []
    for url in urls:
        try:
            event = inspect(url)
            results.append(event)
            print(
                f"{url}: "
                f"{event['fight_marker_count']} "
                "fight markers"
            )
        except Exception as error:
            print(f"{url}: ERROR {error}")
            results.append({
                "url": url,
                "error": str(error),
                "placements": {},
            })

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps({
            "source": BASE,
            "updated_at": datetime.now(
                timezone.utc
            ).isoformat(),
            "status": "html_diagnostic_only",
            "events": results,
        }, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print(f"Saved diagnostic results to {OUTPUT}")

if __name__ == "__main__":
    main()
