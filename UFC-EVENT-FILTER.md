# UFC Streak Finder event filter

Deployed to the test Lab on October 20, 2026. The UFC Streak Finder now has an event dropdown containing six upcoming events, plus the existing all-upcoming-and-ranked view. Event selections restrict streak results to fighters booked on that event using canonical UFC photo-library identities. Search, streak category and minimum-length filters continue to apply.

The event snapshot is stored in `data/ufc-streak-events.json`, derived from the UFC library's documented event assignments. Refresh this snapshot when future cards change. Unknown event IDs return no fighters. Failed data loading is surfaced in the interface.

Validation: all 19 application tests passed, including booked versus unbooked fighters, unknown events and the all-events view. On the hosted test Lab, UFC 333 displayed 21 qualifying fighter streak cards and the expected fighter IDs. Deployment uploaded 1,064 files successfully through the authenticated Cloudflare dashboard. NCAA photo exports are not part of this release.
