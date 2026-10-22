"""Synthetic geometry provenance tests; not validation of real flood labels."""
import importlib.util
import sys
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
BACKEND = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("phase6b_geodata", BACKEND / "scripts/audit-phase6b-geodata.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def feature(identifier, ring):
    return {"type": "Feature", "id": identifier, "geometry": {"type": "Polygon", "coordinates": [ring]},
            "properties": {"layer_name_riskinfo": "Kelani River Floods May 2016", "class_name": None}}


class GeometryTests(unittest.TestCase):
    def test_invalid_geometry_is_excluded_explicitly_without_repair(self):
        invalid = feature(1, [[80, 7], [80.01, 7.01], [80, 7.01], [80.01, 7], [80, 7]])
        valid = feature(2, [[80, 7], [80, 7.01], [80.01, 7.01], [80.01, 7], [80, 7]])
        source = {"type": "FeatureCollection", "features": [invalid, valid]}
        result, subset = audit.inspect_geojson(source)
        self.assertEqual(result["originalFeatureCount"], 2)
        self.assertEqual(result["validGeometryFeatures"], 1)
        self.assertEqual(result["invalidFeatures"][0]["id"], 1)
        self.assertFalse(result["repairApplied"])
        self.assertEqual(subset["features"], [valid])
        self.assertEqual(len(source["features"]), 2)

    def test_geojson_does_not_create_label_semantics_or_dates(self):
        f = feature(2, [[80, 7], [80, 7.01], [80.01, 7.01], [80.01, 7], [80, 7]])
        _, subset = audit.inspect_geojson({"type": "FeatureCollection", "features": [f]})
        self.assertIsNone(subset["features"][0]["properties"]["class_name"])
        self.assertNotIn("observationTime", subset["features"][0]["properties"])

    def test_duplicate_geometries_reported(self):
        f = feature(2, [[80, 7], [80, 7.01], [80.01, 7.01], [80.01, 7], [80, 7]])
        result, _ = audit.inspect_geojson({"type": "FeatureCollection", "features": [f, {**f, "id": 3}]})
        self.assertEqual(result["normalizedDuplicateFeatureIds"], [3])

    def test_projected_coordinates_cannot_be_mislabeled_as_geographic(self):
        f = feature(2, [[400000, 700000], [400000, 700100], [400100, 700100], [400100, 700000], [400000, 700000]])
        with self.assertRaises(ValueError):
            audit.inspect_geojson({"type": "FeatureCollection", "features": [f]})


if __name__ == "__main__":
    unittest.main()
