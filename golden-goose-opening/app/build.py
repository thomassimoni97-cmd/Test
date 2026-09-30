"""Assembla gg-openings.html (pagina Artifact) da parts/ e incorpora il workbook demo."""
import base64
import pathlib

here = pathlib.Path(__file__).parent
demo = base64.b64encode((here / "../sheet/GG_Opening_Action_Log.xlsx").read_bytes()).decode()
html = "".join((here / "parts" / p).read_text() for p in ("head.html", "model.js", "ui.js"))
(here / "gg-openings.html").write_text(html.replace("__DEMO_B64__", demo))
print("built gg-openings.html", len(html) // 1024, "KB + demo")

# Versione standalone da scaricare: documento HTML completo, SheetJS incorporato (funziona anche offline).
sheetjs = pathlib.Path(__import__("sys").argv[1]).read_text() if len(__import__("sys").argv) > 1 else None
if sheetjs:
    page = (here / "gg-openings.html").read_text()
    cdn = '<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>'
    assert cdn in page
    page = page.replace(cdn, "<script>" + sheetjs.replace("</script", "<\\/script") + "</script>")
    standalone = ("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
                  "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
                  "<style>body{margin:0}[hidden]{display:none!important}img{max-width:100%}</style>\n"
                  "</head>\n<body>\n" + page + "\n</body>\n</html>\n")
    (here / "GG_Openings.html").write_text(standalone)
    print("built GG_Openings.html", len(standalone) // 1024, "KB")
