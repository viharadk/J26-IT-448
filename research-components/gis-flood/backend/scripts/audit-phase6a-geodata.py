"""Read downloaded official vectors without inventing labels or repairing geometry.

Requires shapely, pyproj, pyshp and pypdf. Installs may be isolated under the
ignored artifacts/phase6a-python-deps directory. No production code is modified.
"""
import hashlib
import io
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZipFile

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "artifacts/phase6a-python-deps"))
import shapefile
import shapely
from shapely.geometry import shape, mapping
from shapely.ops import transform, unary_union
from shapely.validation import explain_validity
from pyproj import CRS, Transformer, Geod
from pypdf import PdfReader

FOLDER = BACKEND / "artifacts/phase6a-reference-acquisition"
PHASE5 = BACKEND / "artifacts/ahp-sar-phase5a-2026-10-20T15-21-49-034Z/results.json"


def digest(content):
    return hashlib.sha256(content).hexdigest()


def geodesic_km2(geometry):
    """Sum non-overlapping polygon areas; ring orientation normalized first."""
    if geometry.is_empty:
        return 0.0
    if geometry.geom_type == "Polygon":
        from shapely.geometry.polygon import orient
        return abs(Geod(ellps="WGS84").geometry_area_perimeter(orient(geometry, sign=1.0))[0]) / 1e6
    if geometry.geom_type in ("MultiPolygon", "GeometryCollection"):
        return sum(geodesic_km2(part) for part in geometry.geoms)
    return 0.0


def read_layer(archive, name, aoi):
    stem = name[:-4]
    members = set(archive.namelist())
    prj = archive.read(stem + ".prj").decode("utf-8-sig")
    crs = CRS.from_wkt(prj)  # missing/invalid CRS is a failure, never guessed
    reproject = Transformer.from_crs(crs, "EPSG:4326", always_xy=True).transform
    reader = shapefile.Reader(shp=io.BytesIO(archive.read(name)),
                              shx=io.BytesIO(archive.read(stem + ".shx")),
                              dbf=io.BytesIO(archive.read(stem + ".dbf")) if stem + ".dbf" in members else None)
    geometries, features, attributes, invalid = [], [], [], []
    for index, shp in enumerate(reader.shapes()):
        geometry = transform(reproject, shape(shp.__geo_interface__))
        record = json.loads(json.dumps(reader.record(index).as_dict() if reader.fields else {}, default=str))
        if not geometry.is_valid:
            invalid.append({"index": index, "reason": explain_validity(geometry)})
        geometries.append(geometry)
        features.append({"type": "Feature", "geometry": mapping(geometry), "properties": record})
        attributes.append(record)
    duplicates = len(geometries) - len({shapely.normalize(g).wkb for g in geometries})
    result = {"member": name, "featureCount": len(geometries), "crsWkt": prj,
              "crsAuthority": crs.to_authority(), "exportCrs": "EPSG:4326",
              "invalidFeatures": invalid, "normalizedDuplicateGeometries": duplicates,
              "attributeSamples": attributes[:8],
              "attributeValues": {key: sorted({str(row.get(key)) for row in attributes})[:100]
                                  for key in (attributes[0].keys() if attributes else [])}}
    if invalid:
        result["intersectionStatus"] = "INVALID_GEOMETRY_NOT_REPAIRED"
    else:
        merged = unary_union(geometries)
        result.update({"boundsWgs84": list(merged.bounds), "unionAreaKm2": geodesic_km2(merged),
                       "lowerKelaniIntersectionKm2": None, "lowerKelaniIntersects": None})
        if not merged.envelope.intersects(aoi.envelope):
            result.update({"lowerKelaniIntersectionKm2": 0.0, "lowerKelaniIntersects": False,
                           "intersectionStatus": "DISJOINT_BOUNDING_BOXES_PROVE_ZERO_INTERSECTION"})
        elif aoi.is_valid:
            intersection = merged.intersection(aoi)
            result.update({"lowerKelaniIntersectionKm2": geodesic_km2(intersection),
                           "lowerKelaniIntersects": merged.intersects(aoi),
                           "intersectionStatus": "MEASURED_VECTOR_INTERSECTION"})
        else:
            result["intersectionStatus"] = "AOI_PLANAR_TOPOLOGY_REQUIRES_NATIVE_EE_CHECK"
    return result, {"type": "FeatureCollection", "features": features}


def main():
    prior = json.loads(PHASE5.read_text(encoding="utf-8"))
    if prior["status"] != "completed":
        raise ValueError("Phase 5A AOI source is not a completed real Earth Engine result")
    hazard_hash = digest((BACKEND / "services/hazardService.js").read_bytes())
    if hazard_hash != prior["reproducibility"]["sourceHashes"]["services/hazardService.js"]:
        raise ValueError("Current production AOI builder differs from the verified Phase 5A source")
    aoi_geojson = prior["spatialMetadata"]["aoiGeoJson"]
    aoi = shape(aoi_geojson)
    result = {"status": "AUDIT_ONLY", "executedAt": datetime.now(timezone.utc).isoformat(),
              "aoiProvenance": {"file": str(PHASE5.relative_to(BACKEND)), "sha256": digest(PHASE5.read_bytes()),
                                "hazardServiceSha256": hazard_hash, "geometry": aoi_geojson,
                                "boundsWgs84": list(aoi.bounds), "basinIds": prior["spatialMetadata"]["basinIds"],
                                "planarValid": aoi.is_valid, "planarValidityReason": explain_validity(aoi),
                                "geometryRepairApplied": False},
              "areaMethod": "WGS84 geodesic area of valid vector unions/intersections; this audit does not estimate classification accuracy or replace EE pixelArea evaluation.",
              "packages": [], "pdfs": [], "software": {"shapely": shapely.__version__, "pyshp": shapefile.__version__}}
    for archive_path in sorted(FOLDER.glob("EMSR205*vector.zip")):
        entry = {"file": archive_path.name, "sha256": digest(archive_path.read_bytes()), "layers": []}
        with ZipFile(archive_path) as archive:
            if archive.testzip() is not None:
                raise ValueError("ZIP integrity failed: " + archive_path.name)
            entry["members"] = archive.namelist()
            for name in archive.namelist():
                if name.endswith(".shp") and any(kind in name for kind in ("area_of_interest", "crisis_information_poly", "general_information_poly")):
                    layer, geojson = read_layer(archive, name, aoi)
                    entry["layers"].append(layer)
                    export = FOLDER / (name[:-4] + ".geojson")
                    export.write_text(json.dumps(geojson), encoding="utf-8")
                    layer["geojsonFile"] = export.name
                    layer["geojsonSha256"] = digest(export.read_bytes())
        result["packages"].append(entry)
    for pdf in sorted(FOLDER.glob("EMSR205*.pdf")):
        reader = PdfReader(pdf)
        text = "\n\n".join(page.extract_text(extraction_mode="layout") for page in reader.pages).replace("\x00", "")
        txt = pdf.with_suffix(".txt")
        txt.write_text(text, encoding="utf-8")
        result["pdfs"].append({"file": pdf.name, "sha256": digest(pdf.read_bytes()), "pages": len(reader.pages), "textFile": txt.name})
    (FOLDER / "geodata-audit.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    for package in result["packages"]:
        print(package["file"])
        for layer in package["layers"]:
            print(json.dumps({key: layer.get(key) for key in ("member", "featureCount", "crsAuthority", "invalidFeatures", "normalizedDuplicateGeometries", "boundsWgs84", "lowerKelaniIntersectionKm2", "attributeValues")}))
    print("PDFs extracted:", len(result["pdfs"]))


if __name__ == "__main__":
    main()
