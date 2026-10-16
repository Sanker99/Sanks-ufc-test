identity = (key(col(row, 'EVENT')), key(col(row, 'BOUT')),
                    key(col(row, 'FIGHTER')))
        found = False
        for source, metric in (
            ('SIG.STR.', 'sig_strikes'), ('TOTAL STR.', 'total_strikes'),
            ('TD', 'takedowns'), ('SUB.ATT.', 'submissions')):
            number = first_number(col(row, source))
            if number is not None:
                totals[identity][metric] += number
                found = True
        matched_stats += int(found)

    histories = defaultdict(list)
    joined_fights = 0
    for row in results:
        event = col(row, 'EVENT')
        bout = col(row, 'BOUT')
        names = fight_names(bout)
        if len(names) != 2:
            continue
        outcome = col(row, 'OUTCOME').upper().replace(' ', '')
        for index, (name, opponent) in enumerate(((names[0], names[1]),
                                                   (names[1], names[0]))):
            if outcome == 'W/L':
                result = 'W' if index == 0 else 'L'
            elif outcome == 'L/W':
                result = 'L' if index == 0 else 'W'
            elif outcome in ('DRAW', 'D/D'):
                result = 'D'
            elif 'NC' in outcome:
                result = 'NC'
            else:
                result = ''
            identity = (key(event), key(bout), key(name))
            fight_stats = dict(totals.get(identity, {}))
            joined_fights += bool(fight_stats)
            entry = {
                'date': event_dates.get(key(event), ''),
                'event': event, 'opponent': opponent, 'result': result,
                'method': col(row, 'METHOD'), 'round': col(row, 'ROUND'),
                'weightclass': col(row, 'WEIGHTCLASS'),
            }
            entry.update(fight_stats)
            histories[key(name)].append(entry)

    output = {}
    for row in fighters:
        name = ' '.join(part.strip() for part in
                        (col(row, 'FIRST'), col(row, 'LAST')) if part.strip())
        ident = key(name)
        if not ident:
            continue
        fights = sorted(histories.get(ident, []),
                        key=lambda f: f['date'], reverse=True)
        measure = physical.get(ident, {})
        division = next((f['weightclass'] for f in fights
                         if f.get('weightclass')), '')
        wins = sum(f['result'] == 'W' for f in fights)
        losses = sum(f['result'] == 'L' for f in fights)
        draws = sum(f['result'] == 'D' for f in fights)
        def measure_value(field):
            value = col(measure, field).strip()
            return '' if value in ('--', 'N/A') else value
        output[ident] = {
            'name': name, 'nickname': col(row, 'NICKNAME'),
            'record': f'{wins}-{losses}-{draws}',
            'weightclass': division, 'height': measure_value('HEIGHT'),
            'weight': measure_value('WEIGHT'), 'reach': measure_value('REACH'),
            'stance': measure_value('STANCE'),
            'profile_url': measure_value('URL'),
            'fights': fights[:7],
        }

    with_history = sum(bool(f['fights']) for f in output.values())
    with_measurements = sum(bool(f['height'] or f['reach']) for f in output.values())
    with_stats = sum(any('sig_strikes' in fight or 'takedowns' in fight
                         for fight in f['fights']) for f in output.values())
    with_dates = sum(any(fight['date'] for fight in f['fights'])
                     for f in output.values())
    coverage = {
        'fighters': len(output), 'with_history': with_history,
        'with_measurements': with_measurements,
        'with_stats': with_stats, 'with_dates': with_dates,
        'results': len(results), 'stats_rows': len(stats),
        'matched_stats_rows': matched_stats,
        'joined_fighter_fights': joined_fights,
        'events': len(events),
        'latest_event_date': max(event_dates.values(), default=''),
    }
    print('Coverage:', coverage, flush=True)
    if (len(output) < 100 or with_history < 50 or
            with_measurements < 50 or with_stats < 50 or with_dates < 50):
        raise RuntimeError('Incomplete UFC data join. Existing published file preserved.')

    payload = {'updated': datetime.now(timezone.utc).isoformat(),
               'source': BASE, 'coverage': coverage, 'fighters': output}
    destination = Path('data/ufc-data.json')
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix('.tmp')
    temporary.write_text(json.dumps(payload, ensure_ascii=False,
                                    separators=(',', ':')), encoding='utf-8')
    temporary.replace(destination)
    print('Published', destination, flush=True)

if __name__ == '__main__':
    main()
