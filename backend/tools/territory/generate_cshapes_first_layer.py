import lzma
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.geometry import box

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CSHAPES = PROJECT_ROOT / 'data_source' / 'cshapes-master' / 'inst' / 'extdata' / 'cshapes_2_gw.topojson.xz'
OUTPUT_DIR = PROJECT_ROOT / 'assets' / 'geo' / 'territories'

SNAPSHOTS = {
    'mainregions_country_1930.geojson': '1930-01-01',
    'mainregions_country_1938.geojson': '1938-10-01',
    'mainregions_country_1939.geojson': '1939-09-15',
    'mainregions_country_1945.geojson': '1945-09-02',
}

REGION_BBOXES = [
    box(-25, 34, 45, 72),    # Europe
    box(-18, 14, 40, 38),    # North Africa
    box(95, 5, 150, 60),     # East Asia
    box(100, -50, 180, 35),  # West/Central Pacific
    box(-180, -50, -100, 35) # East Pacific wrap-around
]


def load_cshapes(path: Path):
    if not path.exists():
        raise FileNotFoundError(f'CShapes topojson not found: {path}')
    temp_path = OUTPUT_DIR / '_cshapes_temp.topojson'
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with lzma.open(path) as f:
        temp_path.write_bytes(f.read())
    try:
        gdf = gpd.read_file(temp_path)
    finally:
        temp_path.unlink(missing_ok=True)
    return gdf


def build_first_wave(gdf: gpd.GeoDataFrame):
    masks = [gdf.geometry.intersects(b) for b in REGION_BBOXES]
    mask = masks[0]
    for m in masks[1:]:
        mask = mask | m
    region = gdf[mask].copy()
    region = region[[
        'gwcode', 'country_name', 'start', 'end', 'status', 'owner',
        'capname', 'caplong', 'caplat', 'b_def', 'geometry'
    ]]

    for file_name, snapshot_date in SNAPSHOTS.items():
        ts = pd.Timestamp(snapshot_date)
        snap = region[(region['start'] <= ts) & (region['end'] >= ts)].copy()
        snap['start'] = snap['start'].dt.strftime('%Y-%m-%d')
        snap['end'] = snap['end'].dt.strftime('%Y-%m-%d')
        snap['snapshot_date'] = snapshot_date
        snap = snap.sort_values(['country_name', 'gwcode'])
        snap.to_file(OUTPUT_DIR / file_name, driver='GeoJSON')
        print(f'Wrote {file_name}: {len(snap)} features')


def main():
    gdf = load_cshapes(DEFAULT_CSHAPES)
    build_first_wave(gdf)


if __name__ == '__main__':
    main()
