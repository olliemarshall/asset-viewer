import test from "node:test";
import assert from "node:assert/strict";
import { matchAssetLabel, chooseDrawingRegion, classifyPixelData } from "../lib/extract.js";

test("original and alternate railway label conventions", () => {
  for (const [label, type] of [
    ["SA123", "signal"], ["PT321", "points"], ["TC456", "track_circuit"],
    ["LC12", "location_case"], ["L42R", "signal"], ["AB(2) T", "track_circuit"],
    ["1234(A)T", "track_circuit"], ["ABCQ", "track_equipment"],
    ["ES3A", "wheel_sensor"], ["AS4B", "wheel_sensor"],
    ["ABC/DM1234U", "track_equipment"], ["POLE3", "pole"]
  ]) assert.equal(matchAssetLabel(label)?.type, type, label);
  for (const label of ["123", "120.123km", "NOTE 6", "#5", "75MPH", "SEE L42R"]) {
    assert.equal(matchAssetLabel(label), null, label);
  }
});

test("wide layout excludes right-side notes only when recognised or selected", () => {
  assert.equal(chooseDrawingRegion(3.5, "WHEEL SENSOR NAMING CONVENTION").right, 0.60);
  assert.equal(chooseDrawingRegion(3.5, "Other plan").right, 1);
  assert.equal(chooseDrawingRegion(1.5, "", "wide").right, 0.60);
  assert.equal(chooseDrawingRegion(3.5, "WHEEL SENSOR NAMING CONVENTION", "standard").right, 1);
});

test("colour suggestions and uncertainty", () => {
  const pixels = (...colors) => new Uint8ClampedArray(colors.flatMap(c => Array.from({ length: 10 }, () => [...c, 255]).flat()));
  assert.equal(classifyPixelData(pixels([230, 0, 0], [255, 255, 255])), "NEW");
  assert.equal(classifyPixelData(pixels([0, 180, 0])), "RECOVER");
  assert.equal(classifyPixelData(pixels([0, 0, 230])), "PROPOSED");
  assert.equal(classifyPixelData(pixels([0, 0, 0])), "EXISTING");
  assert.equal(classifyPixelData(pixels([255, 255, 255])), "REVIEW");
  assert.equal(classifyPixelData(pixels([0, 0, 0], [255, 0, 0], [0, 0, 255])), "REVIEW");
});
