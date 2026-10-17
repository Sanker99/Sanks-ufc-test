
#!/usr/bin/env python3
"""Inspect official UFC event pages for fight-card placement.

Discovery and diagnostics only. No unverified placements are published.
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

HEADINGS = {
    "main card": "main",
    "prelims": "prelims",
    "preliminary card": "prelims",
    "early prelims": "early_prelims",
    "early preliminary card": "early_prelims",
}


def fetch(url):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "text/html",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


class PageInspector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = set()
        self.text = []
        self.stack = []
        self.fight_classes = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = attrs.get("class", "")

        if "fight" in classes.lower():
            self.fight_classes.update(classes.split())

        self.stack.append(tag)

        if tag == "a":
            href = attrs.get("href", "")
            url = urljoin(BASE, href)
            parsed = urlparse(url)

            if (
                parsed.netloc in ("www.ufc.com", "ufc.com")
                and parsed.path.startswith("/event/")
            ):
                self.links.add(
                    BASE + parsed.path.rstrip("/")
                )

    def handle_endtag(self, tag):
        if tag in self.stack:
            index = len(self.stack) - 1 - self.stack[::-1].index(tag)
            self.stack = self.stack[:index]

    def handle_data(self, data):
        value = " ".join(data.split())
        if value:
            self.text.append(value)


def inspect_event(url):
    html = fetch(url)
    parser = PageInspector()
    parser.feed(html)

    text = parser.text

    sections = []
    for index, value in enumerate(text):
        normalized = re.sub(
            r"\s+", " ", value.lower()
        ).strip(" :")

        if normalized in HEADINGS:
            sections.append({
                "section": HEADINGS[normalized],
                "label": value,
                "nearby_text": text[
                    max(0, index - 3):index + 12
                ],
            })

    return {
        "url": url,
        "sections_detected": sections,
        "fight_related_classes": sorted(
            parser.fight_classes
        )[:50],
        "page_text_sample": text[:120],
        "placements": {},
    }


def main():
    print("Discovering official UFC events...")

    page = PageInspector()
    page.feed(fetch(BASE + "/events"))

    urls = sorted(page.links)

    if not urls:
        raise RuntimeError("No UFC event pages discovered.")

    print(f"Found {len(urls)} event pages.")

    results = []
    for url in urls:
        try:
            event = inspect_event(url)
            results.append(event)

            print(
                f"{url}: "
                f"{len(event['sections_detected'])} "
                "section headings detected"
            )
        except Exception as error:
            print(f"Could not inspect {url}: {error}")
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
            "status": "inspection_only",
            "events": results,
        }, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print(f"Saved inspection results to {OUTPUT}")


if __name__ == "__main__":
    main()
