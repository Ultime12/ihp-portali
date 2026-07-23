from __future__ import annotations

import html
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "IHP-Sistem-Kullanim-Kitapcigi.md"
OUTPUT = ROOT / "output" / "pdf" / "IHP-Sistem-Kullanim-Kitapcigi.pdf"
LOGO = ROOT / "assets" / "identity" / "party-mark.png"

NAVY = colors.HexColor("#071426")
NAVY_2 = colors.HexColor("#0E2140")
BLUE = colors.HexColor("#4F8CFF")
VIOLET = colors.HexColor("#8B7CFF")
TEXT = colors.HexColor("#1D2939")
MUTED = colors.HexColor("#536273")
LIGHT = colors.HexColor("#EEF4FF")
LINE = colors.HexColor("#D8E2F0")
GOLD = colors.HexColor("#D7B56D")


def register_fonts() -> tuple[str, str]:
    regular = Path(r"C:\Windows\Fonts\arial.ttf")
    bold = Path(r"C:\Windows\Fonts\arialbd.ttf")
    if regular.exists() and bold.exists():
        pdfmetrics.registerFont(TTFont("IHP-Regular", str(regular)))
        pdfmetrics.registerFont(TTFont("IHP-Bold", str(bold)))
        pdfmetrics.registerFontFamily("IHP", normal="IHP-Regular", bold="IHP-Bold")
        return "IHP-Regular", "IHP-Bold"
    return "Helvetica", "Helvetica-Bold"


REGULAR, BOLD = register_fonts()


def inline_markup(text: str) -> str:
    escaped = html.escape(text, quote=False)
    escaped = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", escaped)
    escaped = re.sub(
        r"(https?://[^\s<]+)",
        rf'<link href="\1" color="#{BLUE.hexval()[2:]}">\1</link>',
        escaped,
    )
    return escaped


def styles():
    sheet = getSampleStyleSheet()
    return {
        "body": ParagraphStyle(
            "IHPBody",
            parent=sheet["BodyText"],
            fontName=REGULAR,
            fontSize=9.4,
            leading=12.1,
            textColor=TEXT,
            spaceAfter=5,
            allowWidows=0,
            allowOrphans=0,
        ),
        "h1": ParagraphStyle(
            "IHPH1",
            parent=sheet["Heading1"],
            fontName=BOLD,
            fontSize=17,
            leading=20,
            textColor=BLUE,
            spaceBefore=2,
            spaceAfter=10,
            keepWithNext=1,
        ),
        "h2": ParagraphStyle(
            "IHPH2",
            parent=sheet["Heading2"],
            fontName=BOLD,
            fontSize=12.2,
            leading=15,
            textColor=colors.HexColor("#1F4D78"),
            spaceBefore=11,
            spaceAfter=6,
            keepWithNext=1,
        ),
        "h3": ParagraphStyle(
            "IHPH3",
            parent=sheet["Heading3"],
            fontName=BOLD,
            fontSize=10.7,
            leading=13.2,
            textColor=NAVY_2,
            spaceBefore=8,
            spaceAfter=4,
            keepWithNext=1,
        ),
        "bullet": ParagraphStyle(
            "IHPBullet",
            parent=sheet["BodyText"],
            fontName=REGULAR,
            fontSize=9.2,
            leading=11.8,
            leftIndent=20,
            firstLineIndent=-10,
            bulletIndent=4,
            textColor=TEXT,
            spaceAfter=3.5,
            allowWidows=0,
            allowOrphans=0,
        ),
        "number": ParagraphStyle(
            "IHPNumber",
            parent=sheet["BodyText"],
            fontName=REGULAR,
            fontSize=9.2,
            leading=11.8,
            leftIndent=22,
            firstLineIndent=-14,
            textColor=TEXT,
            spaceAfter=3.5,
            allowWidows=0,
            allowOrphans=0,
        ),
        "callout": ParagraphStyle(
            "IHPCallout",
            parent=sheet["BodyText"],
            fontName=REGULAR,
            fontSize=9.3,
            leading=12,
            textColor=NAVY_2,
            spaceAfter=0,
        ),
        "toc": ParagraphStyle(
            "IHPToc",
            parent=sheet["BodyText"],
            fontName=BOLD,
            fontSize=9.3,
            leading=11,
            textColor=TEXT,
            spaceAfter=0,
        ),
        "small": ParagraphStyle(
            "IHPSmall",
            parent=sheet["BodyText"],
            fontName=REGULAR,
            fontSize=8,
            leading=10,
            textColor=MUTED,
        ),
    }


STYLES = styles()


def draw_cover(canvas, doc) -> None:
    width, height = letter
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, width, height, fill=1, stroke=0)

    canvas.setFillColor(colors.Color(0.31, 0.55, 1, alpha=0.14))
    canvas.circle(width * 0.15, height * 0.82, 150, fill=1, stroke=0)
    canvas.setFillColor(colors.Color(0.55, 0.49, 1, alpha=0.16))
    canvas.circle(width * 0.87, height * 0.30, 190, fill=1, stroke=0)
    canvas.setStrokeColor(colors.HexColor("#223B63"))
    canvas.setLineWidth(1)
    canvas.roundRect(36, 36, width - 72, height - 72, 22, fill=0, stroke=1)

    if LOGO.exists():
        canvas.drawImage(str(LOGO), width / 2 - 48, height - 178, 96, 96, mask="auto", preserveAspectRatio=True)

    canvas.setFont(BOLD, 10)
    canvas.setFillColor(GOLD)
    canvas.drawCentredString(width / 2, height - 212, "İHP  •  DİJİTAL SİSTEMLER")

    canvas.setFont(BOLD, 32)
    canvas.setFillColor(colors.white)
    canvas.drawCentredString(width / 2, height - 286, "KULLANIM")
    canvas.setFillColor(VIOLET)
    canvas.drawCentredString(width / 2, height - 326, "KİTAPÇIĞI")

    canvas.setFont(REGULAR, 11)
    canvas.setFillColor(colors.HexColor("#C8D5EA"))
    canvas.drawCentredString(width / 2, height - 365, "Ana Portal  •  Disiplin Kurulu  •  Finans  •  Kurumsal Posta")

    canvas.setStrokeColor(BLUE)
    canvas.setLineWidth(2)
    canvas.line(width / 2 - 100, height - 395, width / 2 + 100, height - 395)

    canvas.setFont(BOLD, 9)
    canvas.setFillColor(colors.HexColor("#9EB3D0"))
    canvas.drawCentredString(width / 2, 112, "19 TEMMUZ 2026")
    canvas.drawCentredString(width / 2, 94, "ÖĞRENCİ TOPLULUĞU DİJİTAL ÇALIŞMA ALANLARI")
    canvas.restoreState()


def draw_page(canvas, doc) -> None:
    width, height = letter
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.6)
    canvas.line(doc.leftMargin, height - 45, width - doc.rightMargin, height - 45)
    canvas.setFont(BOLD, 7.5)
    canvas.setFillColor(BLUE)
    canvas.drawString(doc.leftMargin, height - 37, "İHP DİJİTAL SİSTEMLER")
    canvas.setFont(REGULAR, 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(width - doc.rightMargin, height - 37, "KULLANIM KİTAPÇIĞI")
    canvas.setStrokeColor(LINE)
    canvas.line(doc.leftMargin, 37, width - doc.rightMargin, 37)
    canvas.setFont(REGULAR, 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(width - doc.rightMargin, 24, f"SAYFA {canvas.getPageNumber() - 1}")
    canvas.restoreState()


def callout(text: str):
    body = Paragraph(inline_markup(text), STYLES["callout"])
    table = Table([["", body]], colWidths=[0.08 * inch, 5.95 * inch], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, 0), VIOLET),
                ("BACKGROUND", (1, 0), (1, 0), LIGHT),
                ("BOX", (0, 0), (-1, -1), 0.4, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0, colors.white),
                ("LEFTPADDING", (0, 0), (0, 0), 0),
                ("RIGHTPADDING", (0, 0), (0, 0), 0),
                ("LEFTPADDING", (1, 0), (1, 0), 10),
                ("RIGHTPADDING", (1, 0), (1, 0), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    return table


def markdown_table(rows: list[list[str]]):
    values = [[Paragraph(inline_markup(value), STYLES["small"]) for value in row] for row in rows]
    widths = [1.15 * inch, 1.65 * inch, 3.25 * inch] if len(rows[0]) == 3 else None
    table = Table(values, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), NAVY_2),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), BOLD),
                ("GRID", (0, 0), (-1, -1), 0.45, LINE),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#F8FAFD"), colors.white]),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return table


def parse_table(lines: list[str], start: int) -> tuple[list[list[str]], int]:
    rows: list[list[str]] = []
    index = start
    while index < len(lines) and lines[index].strip().startswith("|"):
        values = [cell.strip() for cell in lines[index].strip().strip("|").split("|")]
        if not all(re.fullmatch(r":?-{3,}:?", value) for value in values):
            rows.append(values)
        index += 1
    return rows, index


def contents_story(headings: list[str]):
    story = [Paragraph("İçindekiler", STYLES["h1"]), Paragraph("Uygulama veya işlem başlığına göre ilgili bölüme gidin.", STYLES["body"]), Spacer(1, 8)]
    for index, heading in enumerate(headings, start=1):
        label = re.sub(r"^\d+\.\s*", "", heading)
        number = Paragraph(f"<font color='#FFFFFF'><b>{index:02d}</b></font>", STYLES["toc"])
        text = Paragraph(inline_markup(label), STYLES["toc"])
        table = Table([[number, text]], colWidths=[0.42 * inch, 5.65 * inch], hAlign="LEFT")
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (0, 0), NAVY_2),
                    ("BACKGROUND", (1, 0), (1, 0), LIGHT if index % 2 == 0 else colors.HexColor("#F7F9FC")),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("ALIGN", (0, 0), (0, 0), "CENTER"),
                    ("LEFTPADDING", (0, 0), (0, 0), 6),
                    ("RIGHTPADDING", (0, 0), (0, 0), 6),
                    ("LEFTPADDING", (1, 0), (1, 0), 9),
                    ("RIGHTPADDING", (1, 0), (1, 0), 9),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ("BOX", (0, 0), (-1, -1), 0.3, LINE),
                ]
            )
        )
        story.extend([table, Spacer(1, 3)])
    story.append(PageBreak())
    return story


def body_story(lines: list[str]):
    story = []
    index = 0
    first_major = True
    buffer: list[str] = []
    list_number = 0

    def flush():
        nonlocal buffer
        if buffer:
            text = " ".join(item.strip() for item in buffer).strip()
            if text:
                story.append(Paragraph(inline_markup(text), STYLES["body"]))
            buffer = []

    while index < len(lines):
        stripped = lines[index].strip()
        if not stripped:
            flush()
            list_number = 0
            index += 1
            continue
        if stripped.startswith("|"):
            flush()
            rows, index = parse_table(lines, index)
            story.extend([markdown_table(rows), Spacer(1, 6)])
            continue
        heading = re.match(r"^(#{2,4})\s+(.+)$", stripped)
        if heading:
            flush()
            marks, title = heading.groups()
            level = len(marks) - 1
            if level == 1:
                if not first_major:
                    story.append(PageBreak())
                first_major = False
            story.append(Paragraph(inline_markup(title), STYLES[{1: "h1", 2: "h2", 3: "h3"}[min(level, 3)]]))
            index += 1
            continue
        if stripped.startswith("> "):
            flush()
            story.extend([callout(stripped[2:]), Spacer(1, 6)])
            index += 1
            continue
        bullet = re.match(r"^-\s+(.+)$", stripped)
        if bullet:
            flush()
            story.append(Paragraph(inline_markup(bullet.group(1)), STYLES["bullet"], bulletText="•"))
            index += 1
            continue
        numbered = re.match(r"^(\d+)\.\s+(.+)$", stripped)
        if numbered:
            flush()
            list_number = int(numbered.group(1))
            story.append(Paragraph(inline_markup(numbered.group(2)), STYLES["number"], bulletText=f"{list_number}."))
            index += 1
            continue
        buffer.append(stripped)
        index += 1
    flush()
    return story


def build() -> None:
    markdown = SOURCE.read_text(encoding="utf-8")
    lines = markdown.splitlines()
    body_start = next(index for index, line in enumerate(lines) if line.startswith("## 1."))
    body_lines = lines[body_start:]
    headings = [line[3:].strip() for line in body_lines if line.startswith("## ")]

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=letter,
        rightMargin=1 * inch,
        leftMargin=1 * inch,
        topMargin=0.72 * inch,
        bottomMargin=0.62 * inch,
        title="İHP Dijital Sistemler Kullanım Kitapçığı",
        author="İHP Öğrenci Topluluğu",
        subject="Ana Portal, Disiplin Kurulu, Finans ve Kurumsal Posta kullanım rehberi",
    )

    story = [PageBreak()]
    story.extend(contents_story(headings))
    story.extend(
        [
            callout(
                "Bu kitapçık işlemlerin nerede ve nasıl yapıldığını anlatır. Yetki, süre ve karar konularında sistemde yayımlanan güncel yönetmelik PDF'leri esastır."
            ),
            Spacer(1, 8),
        ]
    )
    story.extend(body_story(body_lines))
    doc.build(story, onFirstPage=draw_cover, onLaterPages=draw_page)
    print(OUTPUT)


if __name__ == "__main__":
    build()
