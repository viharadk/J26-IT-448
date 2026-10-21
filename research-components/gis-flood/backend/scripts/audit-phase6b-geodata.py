"""Phase 6B source audit. Never infer flood labels from rendered map colours."""
import hashlib
import json
import sys
from pathlib import Path
from collections import Counter
from datetime import datetime, timezone

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "artifacts/phase6a-python-deps"))
import shapely
from shapely.geometry import shape, mapping, Polygon
from pyproj import CRS, Transformer
from pypdf import PdfReader
FOLDER = ROOT / "artifacts/phase6b-feasibility"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def inspect_geojson(collection):
    if collection.get("type") != "FeatureCollection":
        raise ValueError("Expected original GeoJSON FeatureCollection")
    valid, invalid, seen, duplicates = [], [], set(), []
    from shapely.validation import explain_validity
    for feature in collection["features"]:
        geometry = shape(feature["geometry"])
        if geometry.geom_type not in ("Polygon", "MultiPolygon"):
            raise ValueError("Reference must contain polygon geometries")
        minx, miny, maxx, maxy = geometry.bounds
        if not (-180 <= minx <= maxx <= 180 and -90 <= miny <= maxy <= 90):
            raise ValueError("Coordinates do not satisfy declared geographic CRS")
        if not geometry.is_valid:
            invalid.append({"id": feature.get("id"), "reason": explain_validity(geometry)})
            continue
        normalized = shapely.normalize(geometry).wkb
        if normalized in seen:
            duplicates.append(feature.get("id"))
        seen.add(normalized)
        valid.append(feature)
    return {"originalFeatureCount": len(collection["features"]), "validGeometryFeatures": len(valid),
            "invalidFeatures": invalid, "normalizedDuplicateFeatureIds": duplicates,
            "repairApplied": False}, {"type": "FeatureCollection", "features": valid}


def inspect_pdf(file):
    reader = PdfReader(file)
    text = "\n\n".join(page.extract_text() for page in reader.pages).replace("\x00", "")
    file.with_suffix(".txt").write_text(text, encoding="utf-8")
    layers = [str(obj.get_object().get("/Name", "")).replace("\x00", "")
              for obj in reader.trailer["/Root"].get("/OCProperties", {}).get("/OCGs", [])]
    result = {"file": file.name, "sha256": sha(file.read_bytes()), "pageCount": len(reader.pages),
              "layerNames": layers, "hasFloodAreaLayer": "Flood_Area" in layers,
              "referenceFloodLabelsExtracted": False, "viewports": [],
              "mapScale": "1:90,000" if "1:90,000" in text else None,
              "nativeMeasurementResolutionMeters": None}
    for page in reader.pages:
        for viewport in page.get("/VP", []):
            viewport = viewport.get_object()
            measure = viewport["/Measure"].get_object()
            if measure.get("/Subtype") != "/GEO":
                raise ValueError("Unsupported PDF measure subtype")
            wkt = str(measure["/GCS"].get_object()["/WKT"])
            source_crs = CRS.from_wkt(wkt)
            to_wgs84 = Transformer.from_crs(source_crs.geodetic_crs, CRS.from_epsg(4326), always_xy=True)
            points = measure["/GPTS"]
            if len(points) < 6 or len(points) % 2:
                raise ValueError("Malformed PDF geographic control points")
            # PDF GPTS are latitude/longitude pairs; base geographic datum is
            # defined by the declared GCS, not silently assumed to be WGS84.
            coords = [to_wgs84.transform(float(points[i+1]), float(points[i])) for i in range(0, len(points), 2)]
            polygon = Polygon(coords)
            if not polygon.is_valid:
                raise ValueError("Invalid GeoPDF viewport boundary")
            footprint = {"type": "Feature", "geometry": mapping(polygon),
                         "properties": {"sourceFile": file.name, "role": "cartographic-viewport-only", "observationFootprintVerified": False}}
            result["viewports"].append({"bboxPdfPoints": list(map(float, viewport["/BBox"])),
                "sourceCrsWkt": wkt, "sourceCrsAuthority": source_crs.to_authority(),
                "gptsOriginalLatitudeLongitude": list(map(float, points)),
                "wgs84Bounds": list(polygon.bounds), "datumTransformation": to_wgs84.description,
                "datumTransformationAccuracyMeters": to_wgs84.accuracy,
                "geographicFootprint": footprint,
                "supportMeaning": "Cartographic extent only; not assessed observations, flood positives or non-flood negatives."})
    return result


def main():
    source = FOLDER / "nsdi-kelani-may2016.geojson"
    reuse = json.loads((FOLDER / "nsdi-reuse-provenance.json").read_text())
    if sha(source.read_bytes()) != reuse["sha256"]:
        raise ValueError("NSDI source checksum differs from acquisition evidence")
    collection = json.loads(source.read_text())
    metadata, valid = inspect_geojson(collection)
    metadata.update({"sourceFile": source.name, "sourceSha256": sha(source.read_bytes()),
        "sourceCrs": "EPSG:4326 (original NSDI query outSR=4326)",
        "sourceCategory": "Kelani River Floods May 2016", "exactObservationTime": None,
        "sourceMethodVerified": False, "negativeLabelsVerified": False, "observationFootprintVerified": False,
        "validSubsetFile": "nsdi-valid-geometry-subset.geojson",
        "qualification": "DATA_NOT_READY", "subsetMeaning": "Geometry-only feasibility subset; source label meaning/date/method and excluded invalid feature remain unresolved."})
    out = FOLDER / metadata["validSubsetFile"]
    out.write_text(json.dumps(valid), encoding="utf-8")
    metadata["validSubsetSha256"] = sha(out.read_bytes())
    pdfs = [inspect_pdf(FOLDER / file) for file in ["survey-kelaniya-2016.pdf", "survey-gampaha-2016.pdf"]]
    result = {"status": "AUDIT_COMPLETED_NOT_LABEL_QUALIFICATION", "executedAt": datetime.now(timezone.utc).isoformat(),
              "nsdi": metadata, "surveyPdfs": pdfs,
              "limitations": ["No source geometry repaired.", "No flood labels extracted from PDF colours.",
                  "GeoPDF viewport coordinates identify cartographic extent, not actual observation support."]}
    (FOLDER / "reference-geodata-audit.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({"nsdi": metadata, "surveyPdfs": [{"file": p["file"], "georeferenced": bool(p["viewports"]),
          "sourceCrs": [v["sourceCrsAuthority"] for v in p["viewports"]], "layer": p["hasFloodAreaLayer"]} for p in pdfs]}, indent=2))
    annual = FOLDER / "irrigation-may2016.pdf"
    if annual.exists() and annual.read_bytes().startswith(b"%PDF"):
        reader = PdfReader(annual)
        selected = []
        for i, page in enumerate(reader.pages):
            txt = page.extract_text() or ""
            if ("2016" in txt and any(term in txt.lower() for term in ["nagalagam", "flood", "foreword"])):
                selected.append({"pdfPageIndex": i, "text": txt})
        (FOLDER / "irrigation-event-extract.json").write_text(json.dumps({"file": annual.name, "sha256": sha(annual.read_bytes()), "pages": selected}, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
