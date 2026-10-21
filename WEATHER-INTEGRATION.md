# Shared NFL / NCAA kickoff weather

Task 11 is implemented using one module (`assets/weather.js`) and the existing matchup cards. The inspected baseline contained no working NFL weather implementation, so both sports now share the same source, formatting, units, caching and refresh behavior.

## Verified sources and behavior

- ESPN event records supply actual NCAA stadiums, neutral-site flags, kickoff and confirmed-time status. NFL venues come from nflverse schedules and current ESPN scoreboard events.
- ESPN venue metadata identifies indoor venues. Historical nflverse roof values identify retractable roofs; they do not establish the roof status of a future game.
- Exact or redirected Wikipedia stadium pages provide primary coordinates with the event city verified in page text. No campus/city-centroid coordinates are substituted. Each location retains its source URL.
- Free Open-Meteo hourly forecasts supply Fahrenheit temperature, conditions, wind speed/direction and precipitation probability nearest confirmed kickoff (within 30 minutes).
- NFL Eastern-time schedules are converted with America/New_York daylight-saving rules. NCAA timestamps retain their explicit UTC offset. Tooltips show venue-local kickoff when forecast timezone information is available.
- Indoor games show Indoor. Retractable or unknown roofs label forecasts as exterior conditions with roof status unknown. Unconfirmed kickoff times, missing coordinates and dates outside the forecast horizon remain explicitly unavailable/pending.

## Updates and failure handling

The test refresh runner requests weather every 30 minutes, reusing hourly per-stadium forecast caches. The browser polls published snapshots every five minutes and automatically refreshes visible venues after one hour. Concurrent requests for the same coordinates are shared, with a 15-minute retry delay after failures. Browser storage contains only public forecasts.

A failed request retains the last valid forecast only for the same venue coordinates and kickoff, visibly labeled Cached. Schedule changes invalidate the old display; coordinate changes invalidate forecast caches. Snapshot timestamps reflect collection time, and forecast timestamps reflect the actual forecast retrieval.

## Validation and limitations

Automated checks cover daylight-saving conversion, nearest-hour selection, unknown values versus zero, indoor/retractable distinctions and verified forecast coverage for ACC, Big 12, B1G, PAC-12 and SEC. Desktop and 390px mobile pages were inspected; the mobile document has no horizontal overflow.

One upcoming stadium, Davis Wade Stadium, did not pass the strict coordinate/city match and displays unavailable rather than guessing. Neutral-site venue records are retained. All forecasts describe expected conditions, not observations or guaranteed roof decisions. Hosted scheduler activation is tracked separately in the batch report.
