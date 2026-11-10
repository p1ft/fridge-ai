# Nutrition data

This directory contains 16 selected foods from USDA FoodData Central SR Legacy
(April 2018). `source-subset.json` preserves source records; `snapshot.json`
contains per-100-gram nutrients, aliases, and unit conversion assumptions.
`manifest.json` records provenance and SHA-256 checksums. Data files are deliberately
excluded from formatting to preserve their recorded bytes.

The source archive URL and release are recorded in the manifest. Runtime lookup is
local and requires no USDA API key. Coverage is limited to exact aliases and supported
unit conversions; the UI marks partial estimates. Cooking yields are not modelled.
