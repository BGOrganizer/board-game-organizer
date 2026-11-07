"""Reject absent, synthetic, skipped, or failed native acceptance reports."""

import sys
import xml.etree.ElementTree as ET
from pathlib import Path

folder = Path(sys.argv[1])
expected = set(sys.argv[2:])
reports = {file.stem: file for file in folder.glob("*.xml")}
assert expected and set(reports) == expected, "Missing or unexpected Maestro reports"
for name, file in reports.items():
    root = ET.parse(file).getroot()
    cases = list(root.iter("testcase"))
    suites = list(root.iter("testsuite"))
    assert len(cases) == 1 and suites, f"No real flow result: {name}"
    case = cases[0]
    assert case.get("name") == name and case.get("status") == "SUCCESS", name
    assert not any(case.find(tag) is not None for tag in ("failure", "error", "skipped")), name
    assert all(
        int(suite.get("tests", "0")) == 1
        and all(int(suite.get(attr, "0")) == 0 for attr in ("failures", "errors", "skipped"))
        for suite in suites
    ), name
print(f"Verified {len(reports)} real Maestro flows; zero failures or skips")
