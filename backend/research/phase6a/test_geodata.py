"""Offline geometry/CRS tests; they do not establish scientific validation."""
import importlib.util
import io
import sys
import unittest
from pathlib import Path
from zipfile import ZipFile

sys.dont_write_bytecode = True

BACKEND = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("phase6a_geodata", BACKEND / "scripts/audit-phase6a-geodata.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
from shapely.geometry import box, Polygon
from pyproj import CRS, Transformer
import shapefile


def package(rings, crs="EPSG:32644", include_crs=True):
    shp, shx, dbf = io.BytesIO(), io.BytesIO(), io.BytesIO()
    writer = shapefile.Writer(shp=shp, shx=shx, dbf=dbf, shapeType=shapefile.POLYGON)
    writer.field("label", "C")
    for ring in rings:
        writer.poly([ring]); writer.record("Flooded Area")
    writer.close()
    data = io.BytesIO()
    with ZipFile(data, "w") as archive:
        for suffix, buffer in [("shp", shp), ("shx", shx), ("dbf", dbf)]:
            archive.writestr("test." + suffix, buffer.getvalue())
        if include_crs:
            archive.writestr("test.prj", CRS.from_user_input(crs).to_wkt())
    data.seek(0)
    return ZipFile(data)


class GeodataTests(unittest.TestCase):
    def test_declared_projected_crs_is_transformed_with_longitude_first(self):
        x, y = Transformer.from_crs(4326, 32644, always_xy=True).transform(80, 7)
        ring = [(x, y), (x, y+100), (x+100, y+100), (x+100, y), (x, y)]
        with package([ring]) as archive:
            result, geojson = audit.read_layer(archive, "test.shp", box(79.9, 6.9, 80.1, 7.1))
        self.assertEqual(result["crsAuthority"], ("EPSG", "32644"))
        lon, lat = geojson["features"][0]["geometry"]["coordinates"][0][0]
        self.assertAlmostEqual(lon, 80, places=6); self.assertAlmostEqual(lat, 7, places=6)
        self.assertAlmostEqual(result["unionAreaKm2"], 0.01, delta=0.00002)
        self.assertGreater(result["lowerKelaniIntersectionKm2"], 0)

    def test_missing_crs_is_rejected(self):
        with package([[(0, 0), (0, 1), (1, 1), (1, 0), (0, 0)]], include_crs=False) as archive:
            with self.assertRaises(KeyError):
                audit.read_layer(archive, "test.shp", box(0, 0, 1, 1))

    def test_duplicates_are_reported_and_union_not_double_counted(self):
        ring = [(80, 7), (80, 7.001), (80.001, 7.001), (80.001, 7), (80, 7)]
        with package([ring, ring], crs="EPSG:4326") as archive:
            result, _ = audit.read_layer(archive, "test.shp", box(79, 6, 81, 8))
        self.assertEqual(result["normalizedDuplicateGeometries"], 1)
        self.assertAlmostEqual(result["unionAreaKm2"], audit.geodesic_km2(Polygon(ring)), places=8)

    def test_invalid_source_polygon_is_flagged_without_repair(self):
        ring = [(80, 7), (80.001, 7.001), (80, 7.001), (80.001, 7), (80, 7)]
        with package([ring], crs="EPSG:4326") as archive:
            result, _ = audit.read_layer(archive, "test.shp", box(79, 6, 81, 8))
        self.assertEqual(result["intersectionStatus"], "INVALID_GEOMETRY_NOT_REPAIRED")
        self.assertEqual(len(result["invalidFeatures"]), 1)

    def test_disjoint_envelopes_prove_zero_even_when_saved_aoi_has_planar_topology_issue(self):
        invalid_aoi = Polygon([(70, 7), (71, 8), (70, 8), (71, 7), (70, 7)])
        self.assertFalse(invalid_aoi.is_valid)
        ring = [(80, 7), (80, 7.01), (80.01, 7.01), (80.01, 7), (80, 7)]
        with package([ring], crs="EPSG:4326") as archive:
            result, _ = audit.read_layer(archive, "test.shp", invalid_aoi)
        self.assertEqual(result["lowerKelaniIntersectionKm2"], 0)
        self.assertEqual(result["intersectionStatus"], "DISJOINT_BOUNDING_BOXES_PROVE_ZERO_INTERSECTION")

    def test_intersecting_envelopes_do_not_hide_invalid_aoi(self):
        invalid_aoi = Polygon([(80, 7), (81, 8), (80, 8), (81, 7), (80, 7)])
        ring = [(80, 7), (80, 7.01), (80.01, 7.01), (80.01, 7), (80, 7)]
        with package([ring], crs="EPSG:4326") as archive:
            result, _ = audit.read_layer(archive, "test.shp", invalid_aoi)
        self.assertIsNone(result["lowerKelaniIntersectionKm2"])
        self.assertEqual(result["intersectionStatus"], "AOI_PLANAR_TOPOLOGY_REQUIRES_NATIVE_EE_CHECK")


if __name__ == "__main__":
    unittest.main()
