"""Derive an illustrative canopy layer for the Constanța graph from Meta/WRI CHM.

uv run --python 3.12 --with rasterio --with scipy --with shapely python scripts/extract-canopy.py \
  /path/120323002.tif mobile/assets/data/constanta-city.json \
  mobile/assets/data/romania-trees.json mobile/assets/data/constanta-canopy.json
The input is the public Meta/WRI 1 m modeled CHM tile 120323002, CC BY 4.0.
The imagery covering Tomis Mall and Tomis Nord was acquired 2019-10-21.
Building and mapped-tree footprints are excluded using the OSM city snapshot.
"""
from __future__ import annotations

import base64
import gzip
import json
import math
import sys
from pathlib import Path

import numpy as np
import rasterio
from rasterio.features import rasterize, shapes
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject, transform
from scipy import ndimage
from shapely.geometry import Point, LineString, mapping, shape


def unpack(path):
    packed = json.loads(Path(path).read_text())
    return json.loads(gzip.decompress(base64.b64decode(packed['payload'])))


def main():
    source, city_path, tree_path, target = map(Path, sys.argv[1:])
    city, trees = unpack(city_path), unpack(tree_path)
    box = city['pilot_m']
    resolution = 4
    width = math.ceil((box['east'] - box['west']) / resolution)
    height = math.ceil((box['north'] - box['south']) / resolution)
    grid = from_origin(box['west'], box['north'], resolution, resolution)
    values = np.zeros((height, width), dtype=np.float32)
    with rasterio.open(source) as dataset:
        reproject(rasterio.band(dataset, 1), values, src_transform=dataset.transform,
                  src_crs=dataset.crs, dst_transform=grid, dst_crs='EPSG:32635',
                  resampling=Resampling.average, num_threads=2)
    print('raster reprojected', values.shape, flush=True)
    building_geometries = []
    for b in city['buildings']:
        for poly in b['geometry']:
            building_geometries.append({'type': 'Polygon', 'coordinates': [
                [(p['x'], p['y']) for p in ring] for ring in poly]})
    blocked = rasterize(building_geometries, out_shape=values.shape, transform=grid,
                        fill=0, default_value=1, all_touched=True, dtype='uint8')
    # Avoid overlaying the same crown twice, and keep OSM's distinct provenance.
    local_trees = [t for t in trees['trees'] if 28.48 <= t[1] <= 28.77 and 44.06 <= t[2] <= 44.37]
    if local_trees:
        xs, ys = transform('EPSG:4326', 'EPSG:32635', [t[1] for t in local_trees], [t[2] for t in local_trees])
        exclusion = []
        for t, x, y in zip(local_trees, xs, ys):
            try:
                diameter = float(str(t[4]).removesuffix(' m'))
                radius = diameter / 2 if 1 <= diameter <= 35 else 3
            except (ValueError, TypeError):
                radius = 3
            exclusion.append(mapping(Point(x, y).buffer(radius + 2)))
        for row in trees['rows']:
            pts = row[1]
            if not pts or not any(28.48 <= p[0] <= 28.77 and 44.06 <= p[1] <= 44.37 for p in pts):
                continue
            lon, lat = zip(*pts)
            rx, ry = transform('EPSG:4326', 'EPSG:32635', lon, lat)
            exclusion.append(mapping(LineString(zip(rx, ry)).buffer(5)))
        blocked |= rasterize(exclusion, out_shape=values.shape, transform=grid, fill=0,
                             default_value=1, all_touched=True, dtype='uint8')
    mask = (values >= 3) & (values <= 60) & (blocked == 0)
    del blocked
    result = []
    tile_size = 256
    for row in range(0, height, tile_size):
        for col in range(0, width, tile_size):
            part = mask[row:row+tile_size, col:col+tile_size]
            if not part.any():
                continue
            labels, count = ndimage.label(part)
            counts = np.bincount(labels.ravel())
            means = ndimage.mean(values[row:row+tile_size, col:col+tile_size], labels, np.arange(1, count+1))
            tile_transform = grid * rasterio.Affine.translation(col, row)
            for geom, label in shapes(labels.astype('int32'), mask=labels > 0, transform=tile_transform):
                label = int(label)
                if counts[label] < 2:
                    continue
                polygon = shape(geom).simplify(2, preserve_topology=True)
                if polygon.is_empty or not polygon.is_valid or polygon.geom_type != 'Polygon':
                    continue
                if len(polygon.exterior.coords) > 128 or sum(len(r.coords) for r in polygon.interiors) > 128:
                    polygon = polygon.simplify(5, preserve_topology=True)
                if len(polygon.exterior.coords) > 128 or sum(len(r.coords) for r in polygon.interiors) > 128:
                    continue
                rings = [polygon.exterior, *polygon.interiors]
                coords = [[[round(x,1), round(y,1)] for x,y in ring.coords] for ring in rings]
                result.append([f'sat-{row}-{col}-{label}', round(float(means[label-1]),1), coords])
        print('processed', min(row + tile_size, height), '/', height, 'polygons', len(result), flush=True)
    raw = json.dumps({'schema_version':1,'source':'Meta/WRI High Resolution Canopy Height Map',
                      'source_url':'https://registry.opendata.aws/dataforgood-fb-forests/',
                      'tile':'120323002','imagery_date_tomis':'2019-10-21',
                      'resolution_m':resolution,'polygons':result}, separators=(',',':')).encode()
    packed = {'format':'umbra-gzip-json-v1','raw_bytes':len(raw),
              'payload':base64.b64encode(gzip.compress(raw,compresslevel=9,mtime=0)).decode()}
    target.write_text(json.dumps(packed,separators=(',',':')))
    print('done',len(result),'polygons',len(raw),'raw bytes',target.stat().st_size,'packed bytes')


if __name__ == '__main__':
    main()
