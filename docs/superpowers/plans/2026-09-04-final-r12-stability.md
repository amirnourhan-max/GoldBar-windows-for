# Final R12 Stability Implementation Plan

**Goal:** Ship the approved final Gold Bar R12 Windows build with complete Excel reporting, organized settings, fixed report import/scrolling, and stable long-running UI performance.

**Architecture:** Keep the existing WPF + WebView2 architecture. Extend the report contract and XLSX writer without breaking sheet1 import compatibility; correct the WebView2 import transport; convert the settings page into an internal sub-navigation; and remove the self-triggering dashboard DOM observer in favor of explicit refresh hooks.

**Tech Stack:** .NET 10 WPF, WebView2, JavaScript renderer, Open XML package generation, Inno Setup, GitHub Actions.

## Tasks
- [ ] Extend report model and XLSX writer to five sheets while keeping melt import compatible.
- [ ] Add self-test coverage for workbook sheet structure and report round-trip.
- [ ] Fix `report:import` bridge protocol mismatch.
- [ ] Add settings sub-navigation: scale/report, gold quote, silver quote, about.
- [ ] Remove the two requested assay result rows.
- [ ] Replace self-triggering dashboard observer with explicit refresh hooks and preserve scroll position.
- [ ] Run GitHub Actions build/UI/installer validation and fix any failures.
- [ ] Merge to main and provide the final installer artifact.
