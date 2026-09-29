"""Assembla gg-openings.html (pagina Artifact) da parts/ e incorpora il workbook demo."""
import base64
import pathlib

here = pathlib.Path(__file__).parent
demo = base64.b64encode((here / "../sheet/GG_Opening_Action_Log.xlsx").read_bytes()).decode()
html = "".join((here / "parts" / p).read_text() for p in ("head.html", "model.js", "ui.js"))
(here / "gg-openings.html").write_text(html.replace("__DEMO_B64__", demo))
print("built gg-openings.html", len(html) // 1024, "KB + demo")
