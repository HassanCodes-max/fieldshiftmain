"""Smoke test: every page renders without an exception.  python tests/test_pages.py"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
sys.path.insert(0, ROOT)
from streamlit.testing.v1 import AppTest  # noqa: E402

PAGES = ["views/0_Home.py", "views/1_Farm_Profile.py", "views/2_NASA_Insights.py",
         "views/3_Seasonal_Analysis.py", "views/4_Rotation_Comparison.py",
         "views/5_Recommendations.py", "views/6_Data_and_Methods.py"]

at = AppTest.from_file(os.path.join(ROOT, "app.py"), default_timeout=240)
at.run()
failed = 0
for pg in PAGES:
    at.switch_page(pg)
    at.run()
    ok = not at.exception
    failed += not ok
    print(pg, "OK" if ok else "ERROR")
    for e in at.exception:
        print("   ", e.message)
        print("    " + "\n    ".join(e.stack_trace[-6:]))
    if pg.endswith("5_Recommendations.py"):
        for m in at.success:
            print("   ", m.value[:240].replace("\n", " "))
sys.exit(1 if failed else 0)
