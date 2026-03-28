import sqlite3
from pathlib import Path
from flask import Flask, jsonify, request
from flask_cors import CORS

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / 'pastpath.db'

app = Flask(__name__)
CORS(app)


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_person_tags(conn, person_id):
    rows = conn.execute(
        """
        SELECT tag_group, tag_value
        FROM person_tags
        WHERE person_id = ?
        ORDER BY id
        """,
        (person_id,),
    ).fetchall()
    result = {
        'roles': [],
        'domains': [],
        'countries': [],
        'theaters': [],
        'themes': [],
        'eras': [],
    }
    for row in rows:
        group = row['tag_group']
        value = row['tag_value']
        if group not in result:
            result[group] = []
        result[group].append(value)
    return result


def get_event_sources(conn, event_id):
    rows = conn.execute(
        "SELECT source_url FROM event_sources WHERE event_id = ? ORDER BY id",
        (event_id,),
    ).fetchall()
    return [
        {'type': 'url', 'title': row['source_url'], 'url': row['source_url']}
        for row in rows
    ]


def get_event_tags(conn, event_id):
    rows = conn.execute(
        "SELECT tag_value FROM event_tags WHERE event_id = ? ORDER BY id",
        (event_id,),
    ).fetchall()
    return [row['tag_value'] for row in rows]


def serialize_person_index(conn, row):
    return {
        'id': row['person_id'],
        'name': row['name'],
        'years': row['display_years'],
        'summary': row['summary'],
        'portrait': row['portrait_local'],
        'qid': row['qid'],
        'wikipedia_url': row['wikipedia_url'],
        'tags': get_person_tags(conn, row['person_id']),
    }


def serialize_person_detail(conn, row):
    events = conn.execute(
        """
        SELECT *
        FROM events
        WHERE person_id = ? AND enabled = 1
        ORDER BY COALESCE(route_order, 9999), COALESCE(date_start, ''), event_id
        """,
        (row['person_id'],),
    ).fetchall()

    event_list = []
    for event in events:
        event_list.append(
            {
                'id': event['event_id'],
                'title': event['title'],
                'description': event['description'],
                'dateStart': event['date_start'],
                'dateEnd': event['date_end'],
                'year': event['year'],
                'place': event['place'],
                'center': [event['lng'], event['lat']] if event['lng'] is not None and event['lat'] is not None else [0, 0],
                'zoom': event['zoom'] if event['zoom'] is not None else 5,
                'pitch': event['pitch'] if event['pitch'] is not None else 20,
                'bearing': event['bearing'] if event['bearing'] is not None else 0,
                'image': event['image_local'] or '',
                'sources': get_event_sources(conn, event['event_id']),
                'tags': get_event_tags(conn, event['event_id']),
                'timelineKey': event['timeline_key'],
                'territoryKey': event['territory_key'],
            }
        )

    return {
        'id': row['person_id'],
        'name': row['name'],
        'years': row['display_years'],
        'summary': row['summary'],
        'portrait': row['portrait_local'],
        'qid': row['qid'],
        'wikipedia_url': row['wikipedia_url'],
        'tags': get_person_tags(conn, row['person_id']),
        'events': event_list,
    }


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'ok': True, 'db': str(DB_PATH)})


@app.route('/api/people', methods=['GET'])
def list_people():
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT * FROM people WHERE enabled = 1 ORDER BY COALESCE(sort_order, 9999), name"
        ).fetchall()
        people = [serialize_person_index(conn, row) for row in rows]
        return jsonify({'people': people})
    finally:
        conn.close()


@app.route('/api/people/<person_id>', methods=['GET'])
def get_person(person_id):
    conn = get_conn()
    try:
        row = conn.execute(
            'SELECT * FROM people WHERE person_id = ? AND enabled = 1',
            (person_id,),
        ).fetchone()
        if not row:
            return jsonify({'error': 'Person not found'}), 404
        return jsonify(serialize_person_detail(conn, row))
    finally:
        conn.close()


@app.route('/api/timeline', methods=['GET'])
def get_timeline():
    year = request.args.get('year', type=int)
    person_id = request.args.get('person_id', type=str)
    conn = get_conn()
    try:
        timeline_rows = conn.execute(
            """
            SELECT *
            FROM timelines
            WHERE enabled = 1
            ORDER BY COALESCE(year, 9999), COALESCE(sort_order, 9999), timeline_key
            """
        ).fetchall()

        if timeline_rows:
            items = [
                {
                    'timelineKey': row['timeline_key'],
                    'timeKey': row['time_key'],
                    'year': row['year'],
                    'displayLabel': row['display_label'] or row['label'] or str(row['year'] or ''),
                    'label': row['label'],
                    'startDate': row['start_date'],
                    'endDate': row['end_date'],
                    'regionScope': row['region_scope'],
                    'territoryKey': row['territory_key'],
                    'sortOrder': row['sort_order'],
                    'isGlobal': bool(row['is_global']) if row['is_global'] is not None else True,
                }
                for row in timeline_rows
                if year is None or row['year'] == year
            ]
        else:
            years = list(range(1930, 1951))
            event_params = []
            event_sql = (
                'SELECT year, COUNT(*) as event_count FROM events '
                'WHERE enabled = 1 AND year IS NOT NULL'
            )
            if person_id:
                event_sql += ' AND person_id = ?'
                event_params.append(person_id)
            event_sql += ' GROUP BY year'
            counts = {row['year']: row['event_count'] for row in conn.execute(event_sql, tuple(event_params)).fetchall()}
            items = [
                {
                    'timelineKey': f'year-{yr}',
                    'timeKey': str(yr),
                    'year': yr,
                    'displayLabel': str(yr),
                    'label': str(yr),
                    'startDate': f'{yr}-01-01',
                    'endDate': f'{yr}-12-31',
                    'regionScope': 'global',
                    'territoryKey': None,
                    'sortOrder': yr,
                    'isGlobal': True,
                    'eventCount': counts.get(yr, 0),
                }
                for yr in years
                if year is None or yr == year
            ]

        milestones = []
        if person_id:
            milestone_rows = conn.execute(
                """
                SELECT event_id, year, title, date_start, timeline_key, territory_key
                FROM events
                WHERE enabled = 1 AND person_id = ? AND year IS NOT NULL
                ORDER BY COALESCE(route_order, 9999), COALESCE(date_start, ''), event_id
                """,
                (person_id,),
            ).fetchall()
            milestones = [
                {
                    'eventId': row['event_id'],
                    'year': row['year'],
                    'title': row['title'],
                    'dateStart': row['date_start'],
                    'timelineKey': row['timeline_key'],
                    'territoryKey': row['territory_key'],
                }
                for row in milestone_rows
                if year is None or row['year'] == year
            ]

        return jsonify({'items': items, 'milestones': milestones, 'minYear': 1930, 'maxYear': 1950})
    finally:
        conn.close()


@app.route('/api/territories', methods=['GET'])
def get_territories():
    year = request.args.get('year', type=int)
    region_scope = request.args.get('region_scope', type=str)
    layer_type = request.args.get('layer_type', type=str)
    conn = get_conn()
    try:
        clauses = ['enabled = 1']
        params = []
        if year is not None:
            clauses.append('year = ?')
            params.append(year)
        if region_scope:
            clauses.append('region_scope = ?')
            params.append(region_scope)
        if layer_type:
            clauses.append('layer_type = ?')
            params.append(layer_type)

        where_sql = ' AND '.join(clauses)
        rows = conn.execute(
            f'''
            SELECT *
            FROM territories
            WHERE {where_sql}
            ORDER BY COALESCE(priority, 9999), COALESCE(year, 9999), territory_key
            ''',
            tuple(params),
        ).fetchall()

        return jsonify(
            {
                'items': [
                    {
                        'territoryKey': row['territory_key'],
                        'layerKey': row['layer_key'],
                        'layerType': row['layer_type'],
                        'regionScope': row['region_scope'],
                        'timeKey': row['time_key'],
                        'year': row['year'],
                        'label': row['label'],
                        'geojsonFile': row['geojson_file'],
                        'styleFill': row['style_fill'],
                        'styleOpacity': row['style_opacity'],
                        'lineColor': row['line_color'],
                        'lineWidth': row['line_width'],
                        'sourceName': row['source_name'],
                        'sourceLicense': row['source_license'],
                        'sourceUrl': row['source_url'],
                        'priority': row['priority'],
                        'notes': row['notes'],
                    }
                    for row in rows
                ]
            }
        )
    finally:
        conn.close()


@app.route('/api/timeline-layer-map', methods=['GET'])
def get_timeline_layer_map():
    timeline_key = request.args.get('timeline_key', type=str)
    region_scope = request.args.get('region_scope', type=str)
    conn = get_conn()
    try:
        clauses = ['1 = 1']
        params = []
        if timeline_key:
            clauses.append('timeline_key = ?')
            params.append(timeline_key)
        if region_scope:
            clauses.append('region_scope = ?')
            params.append(region_scope)
        rows = conn.execute(
            f'''
            SELECT * FROM timeline_layer_map
            WHERE {' AND '.join(clauses)}
            ORDER BY timeline_key, region_scope, id
            ''',
            tuple(params),
        ).fetchall()
        return jsonify(
            {
                'items': [
                    {
                        'timelineKey': row['timeline_key'],
                        'regionScope': row['region_scope'],
                        'countryTerritoryKey': row['country_territory_key'],
                        'controlTerritoryKey': row['control_territory_key'],
                        'campTerritoryKey': row['camp_territory_key'],
                        'frontlineTerritoryKey': row['frontline_territory_key'],
                        'fallbackMode': row['fallback_mode'],
                        'notes': row['notes'],
                    }
                    for row in rows
                ]
            }
        )
    finally:
        conn.close()


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=8000, debug=True)
