# -*- coding: utf-8 -*-
"""把 docs/技术文档.md 渲染成 docs/技术文档.pdf（A4，嵌入中文字体，离线可读）。

用法：
    python docs/build-pdf.py

设计目标：
1. 单一真相：Markdown 是唯一内容源，PDF 只是渲染结果，避免两份内容漂移；
2. 离线：字体从本机 Windows Fonts 目录嵌入，不依赖任何在线字体服务；
3. 可打印：A4、2cm 页边距、页码、章节分页、表格不跨页断裂（尽量）。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    CondPageBreak,
    Frame,
    Image,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parent.parent
MD_PATH = ROOT / "docs" / "技术文档.md"
PDF_PATH = ROOT / "docs" / "技术文档.pdf"

FONT_DIR = Path(r"C:\Windows\Fonts")
INK = colors.HexColor("#15181F")
INK_SOFT = colors.HexColor("#4A4F59")
BRASS = colors.HexColor("#8A6A1F")
BRASS_LIGHT = colors.HexColor("#C9A85C")
CINNABAR = colors.HexColor("#A8322A")
PAPER = colors.HexColor("#FFFFFF")
PANEL = colors.HexColor("#F4EFE4")
GRID = colors.HexColor("#CFC6B6")

PAGE_W, PAGE_H = A4
MARGIN_L = 2.0 * cm
MARGIN_R = 2.0 * cm
MARGIN_T = 2.0 * cm
MARGIN_B = 1.9 * cm


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont("YaHei", str(FONT_DIR / "msyh.ttc"), subfontIndex=0))
    pdfmetrics.registerFont(TTFont("YaHeiBold", str(FONT_DIR / "msyhbd.ttc"), subfontIndex=0))
    pdfmetrics.registerFont(TTFont("Deng", str(FONT_DIR / "Deng.ttf"), subfontIndex=0))
    pdfmetrics.registerFont(TTFont("DengBold", str(FONT_DIR / "Dengb.ttf"), subfontIndex=0))
    pdfmetrics.registerFontFamily(
        "Deng", normal="Deng", bold="DengBold", italic="Deng", boldItalic="DengBold"
    )
    pdfmetrics.registerFontFamily(
        "YaHei", normal="YaHei", bold="YaHeiBold", italic="YaHei", boldItalic="YaHeiBold"
    )


BODY = ParagraphStyle(
    "Body",
    fontName="Deng",
    fontSize=9.6,
    leading=17.2,
    textColor=INK,
    alignment=TA_LEFT,
    wordWrap="CJK",
    spaceAfter=5,
)
BODY_TIGHT = ParagraphStyle("BodyTight", parent=BODY, fontSize=9.0, leading=15.0, spaceAfter=3)
H2 = ParagraphStyle(
    "H2",
    fontName="YaHeiBold",
    fontSize=15,
    leading=22,
    textColor=INK,
    wordWrap="CJK",
    spaceBefore=14,
    spaceAfter=8,
    keepWithNext=1,
)
H3 = ParagraphStyle(
    "H3",
    parent=BODY,
    fontName="YaHeiBold",
    fontSize=11.2,
    leading=18,
    textColor=BRASS,
    spaceBefore=9,
    spaceAfter=5,
    keepWithNext=1,
)
QUOTE = ParagraphStyle(
    "Quote",
    parent=BODY,
    fontSize=9.4,
    leading=16.4,
    textColor=INK_SOFT,
)
CODE = ParagraphStyle(
    "Code",
    fontName="Deng",
    fontSize=8.2,
    leading=13.2,
    textColor=INK,
    wordWrap="CJK",
    leftIndent=8,
    rightIndent=8,
    spaceBefore=4,
    spaceAfter=4,
)
CAPTION = ParagraphStyle(
    "Caption",
    fontName="Deng",
    fontSize=8.2,
    leading=12,
    textColor=INK_SOFT,
    alignment=TA_CENTER,
    spaceBefore=3,
    spaceAfter=10,
)
CELL = ParagraphStyle("Cell", parent=BODY, fontSize=8.0, leading=12.6, spaceAfter=0)
CELL_HEAD = ParagraphStyle(
    "CellHead", parent=CELL, fontName="DengBold", textColor=INK
)


def esc(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def inline(text: str) -> str:
    """转义 + 行内标记：**粗体**、`代码`、[文字](链接) → 文字。"""
    text = esc(text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"`([^`]+)`", r'<font name="DengBold" color="#6B4E12">\1</font>', text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"(?<!\*)\*([^*\n]+)\*(?!\*)", r"<i>\1</i>", text)
    return text


def parse_blocks(md: str):
    lines = md.split("\n")
    i = 0
    blocks = []
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if stripped.startswith("```"):
            i += 1
            buf = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1
            blocks.append(("code", "\n".join(buf)))
            continue

        m = re.match(r"^(#{1,4})\s+(.*)$", stripped)
        if m:
            blocks.append((f"h{len(m.group(1))}", m.group(2).strip()))
            i += 1
            continue

        if stripped.startswith("|") and i + 1 < len(lines) and re.match(r"^\|[\s:|-]+\|$", lines[i + 1].strip()):
            header = [c.strip() for c in stripped.strip("|").split("|")]
            i += 2
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            blocks.append(("table", (header, rows)))
            continue

        m = re.match(r"^!\[([^\]]*)\]\(([^)]+)\)$", stripped)
        if m:
            blocks.append(("image", (m.group(1), m.group(2))))
            i += 1
            continue

        if stripped in ("---", "***"):
            blocks.append(("rule", None))
            i += 1
            continue

        if stripped.startswith("> "):
            buf = []
            while i < len(lines) and lines[i].strip().startswith("> "):
                buf.append(lines[i].strip()[2:])
                i += 1
            blocks.append(("quote", " ".join(buf)))
            continue

        if re.match(r"^- ", stripped):
            buf = []
            while i < len(lines) and re.match(r"^- ", lines[i].strip()):
                buf.append(lines[i].strip()[2:])
                i += 1
            blocks.append(("bullets", buf))
            continue

        if re.match(r"^\d+\.\s+", stripped):
            buf = []
            while i < len(lines) and re.match(r"^\d+\.\s+", lines[i].strip()):
                buf.append(re.sub(r"^\d+\.\s+", "", lines[i].strip()))
                i += 1
            blocks.append(("numbers", buf))
            continue

        if stripped == "":
            i += 1
            continue

        buf = [stripped]
        i += 1
        while i < len(lines):
            nxt = lines[i].strip()
            if nxt == "" or nxt.startswith(("#", "|", "```", ">", "![")) or re.match(r"^- ", nxt) or re.match(r"^\d+\.\s+", nxt) or nxt in ("---", "***"):
                break
            buf.append(nxt)
            i += 1
        blocks.append(("para", " ".join(buf)))
    return blocks


def build_story(blocks, doc_width: float):
    story = []
    used_title = False
    for idx, (kind, payload) in enumerate(blocks):
        if kind == "h1":
            if not used_title:
                used_title = True
            else:
                story.append(PageBreak())
            story.append(Paragraph(inline(payload), ParagraphStyle(
                "H1", fontName="YaHeiBold", fontSize=22, leading=30, textColor=INK,
                wordWrap="CJK", spaceAfter=6)))
            story.append(Spacer(1, 2 * mm))
            story.append(Table([[""]], colWidths=[doc_width], rowHeights=[2],
                               style=TableStyle([("LINEBELOW", (0, 0), (-1, -1), 1.4, BRASS_LIGHT)])))
            story.append(Spacer(1, 5 * mm))
        elif kind == "h2":
            story.append(CondPageBreak(5.2 * cm))
            story.append(Paragraph(inline(payload), H2))
            story.append(Table([[""]], colWidths=[doc_width], rowHeights=[1.2],
                               style=TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.7, GRID)])))
            story.append(Spacer(1, 3.5 * mm))
        elif kind == "h3":
            story.append(CondPageBreak(4.0 * cm))
            story.append(Paragraph(inline(payload), H3))
        elif kind == "h4":
            story.append(Paragraph(inline(payload), H3))
        elif kind == "para":
            story.append(Paragraph(inline(payload), BODY))
        elif kind == "bullets":
            for b in payload:
                story.append(Paragraph(
                    f'<font color="#8A6A1F">·</font> {inline(b)}',
                    ParagraphStyle("Bullet", parent=BODY, leftIndent=10, firstLineIndent=-8, spaceAfter=2.5)))
        elif kind == "numbers":
            for n, item in enumerate(payload, start=1):
                story.append(Paragraph(
                    f'<font color="#8A6A1F">{n}.</font> {inline(item)}',
                    ParagraphStyle("Num", parent=BODY, leftIndent=14, firstLineIndent=-10, spaceAfter=2.5)))
        elif kind == "code":
            # 逐行成行，让长代码块可以跨页续排；整块一个 Table 单元格则无法拆分，会留下大片空白
            code_lines = payload.split("\n") if payload.strip() else [" "]
            rows = [[Paragraph(
                esc(line).replace(" ", "&nbsp;") or "&nbsp;", CODE)] for line in code_lines]
            tbl = Table(rows, colWidths=[doc_width], repeatRows=0)
            tbl.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), PANEL),
                ("BOX", (0, 0), (-1, -1), 0.4, GRID),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 0.5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0.5),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]))
            story.append(tbl)
            story.append(Spacer(1, 3 * mm))
        elif kind == "table":
            header, rows = payload
            ncol = len(header)
            # 用字体度量算每列的自然宽度，再按版心宽度缩放，避免「需要一点规则」被挤成两行
            from reportlab.pdfbase.pdfmetrics import stringWidth

            natural = []
            for c in range(ncol):
                cells = [header[c]] + [(r[c] if c < len(r) else "") for r in rows]
                widest = max(stringWidth(str(cell), "Deng", 8.0) for cell in cells)
                natural.append(min(max(widest + 10, 34), doc_width * 0.5))
            total = sum(natural)
            if total <= doc_width:
                widths = [w * doc_width / total for w in natural]
            else:
                widths = [w * doc_width / total for w in natural]
            data = [[Paragraph(inline(h), CELL_HEAD) for h in header]]
            for r in rows:
                r = (r + [""] * ncol)[:ncol]
                data.append([Paragraph(inline(c), CELL) for c in r])
            tbl = Table(data, colWidths=widths, repeatRows=1)
            tbl.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), PANEL),
                ("TEXTCOLOR", (0, 0), (-1, 0), INK),
                ("GRID", (0, 0), (-1, -1), 0.4, GRID),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]))
            story.append(tbl)
            story.append(Spacer(1, 4 * mm))
        elif kind == "image":
            alt, src = payload
            path = (ROOT / src).resolve()
            if path.exists():
                from PIL import Image as PILImage
                with PILImage.open(path) as im:
                    w, h = im.size
                target_w = min(doc_width * 0.62, 10.5 * cm)
                if h / w > 1.15:  # 竖版截图：收窄，避免整页只剩一张图
                    target_w = 6.0 * cm
                target_h = target_w * h / w
                max_h = 11.0 * cm
                if target_h > max_h:
                    target_h = max_h
                    target_w = target_h * w / h
                story.append(KeepTogether([
                    Image(str(path), width=target_w, height=target_h),
                    Paragraph(inline(alt), CAPTION),
                ]))
        elif kind == "quote":
            cell = Paragraph(f'<i>{inline(payload)}</i>', QUOTE)
            story.append(Table([[cell]], colWidths=[doc_width],
                               style=TableStyle([
                                   ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F7F3EA")),
                                   ("LINEBEFORE", (0, 0), (0, -1), 2.2, BRASS_LIGHT),
                                   ("LEFTPADDING", (0, 0), (-1, -1), 8),
                                   ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                                   ("TOPPADDING", (0, 0), (-1, -1), 5),
                                   ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                               ])))
            story.append(Spacer(1, 4 * mm))
        elif kind == "rule":
            story.append(Spacer(1, 2 * mm))
            story.append(Table([[""]], colWidths=[doc_width], rowHeights=[0.6],
                               style=TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.5, GRID)])))
            story.append(Spacer(1, 4 * mm))
    return story


def draw_cover(canvas, doc):
    """第一页：白底标题区 + 手绘卦符 + 底部深色信息条。"""
    canvas.saveState()

    # ── 标题区 ──
    canvas.setFillColor(INK)
    canvas.setFont("YaHeiBold", 34)
    canvas.drawString(MARGIN_L, PAGE_H - 3.6 * cm, "赛博卦账")
    canvas.setFont("YaHei", 13)
    canvas.setFillColor(colors.HexColor("#6E685E"))
    canvas.drawString(MARGIN_L, PAGE_H - 4.4 * cm, "Cyber Oracle · 技术文档")

    canvas.setStrokeColor(BRASS_LIGHT)
    canvas.setLineWidth(1.6)
    canvas.line(MARGIN_L, PAGE_H - 5.1 * cm, PAGE_W - MARGIN_R, PAGE_H - 5.1 * cm)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN_L, PAGE_H - 5.4 * cm, PAGE_W - MARGIN_R, PAGE_H - 5.4 * cm)

    canvas.setFont("YaHei", 12)
    canvas.setFillColor(INK)
    canvas.drawString(MARGIN_L, PAGE_H - 6.6 * cm, "把一个月账单算成一卦")
    canvas.setFont("YaHei", 9.5)
    canvas.setFillColor(colors.HexColor("#6E685E"))
    canvas.drawString(MARGIN_L, PAGE_H - 7.2 * cm, "大学生消费人格与生存预测看板")
    canvas.drawString(
        MARGIN_L,
        PAGE_H - 7.8 * cm,
        "全国高校 Vibe Coding 开发挑战赛 · 重塑范式 · 推荐方向 6：校园 / 垂直社区全栈 MVP 平台",
    )

    # ── 手绘卦符：风火家人（自下而上 阳 阴 阳 阴 阳 阳）──
    bars = [True, False, True, False, True, True]
    gw, gh, ggap = 5.6 * cm, 5.0, 7.4
    gx, gy = MARGIN_L + 0.1 * cm, PAGE_H - 13.4 * cm
    for i, yang in enumerate(bars):
        y = gy + i * (gh + ggap)
        if yang:
            canvas.setFillColor(colors.HexColor("#C9A85C"))
            canvas.rect(gx, y, gw, gh, stroke=0, fill=1)
        else:
            canvas.setFillColor(colors.HexColor("#A8322A"))
            canvas.rect(gx, y, gw * 0.43, gh, stroke=0, fill=1)
            canvas.rect(gx + gw * 0.57, y, gw * 0.43, gh, stroke=0, fill=1)

    canvas.setFillColor(colors.HexColor("#6E685E"))
    canvas.setFont("YaHei", 9)
    canvas.drawString(gx + gw + 0.9 * cm, gy + 3 * (gh + ggap) + 2, "六爻自下而上")
    canvas.setFont("YaHei", 8.5)
    canvas.drawString(gx + gw + 0.9 * cm, gy + 3 * (gh + ggap) - 12, "阳阴阳阴阳阳 · 上巽下离")
    canvas.drawString(gx + gw + 0.9 * cm, gy + 3 * (gh + ggap) - 26, "第 37 卦 · 风火家人")

    canvas.setFillColor(colors.HexColor("#9C9486"))
    canvas.setFont("YaHei", 8)
    canvas.drawString(MARGIN_L, gy - 0.9 * cm, "卦符按六爻数据自绘，不依赖系统字体是否有 U+4DC0 段字形。")

    # ── 底部信息条 ──
    band_h = 3.0 * cm
    canvas.setFillColor(colors.HexColor("#0C0E13"))
    canvas.rect(0, 0, PAGE_W, band_h, stroke=0, fill=1)
    canvas.setFillColor(colors.HexColor("#E4B457"))
    canvas.setFont("YaHei", 9)
    canvas.drawString(MARGIN_L, band_h - 1.1 * cm, "技术栈")
    canvas.setFillColor(colors.HexColor("#F3EEE3"))
    canvas.drawString(MARGIN_L + 1.2 * cm, band_h - 1.1 * cm,
                      "Next.js 15 · React 19 · TypeScript strict · Tailwind 3.4 · echarts 5.6 · vitest 2.1")
    canvas.setFillColor(colors.HexColor("#E4B457"))
    canvas.drawString(MARGIN_L, band_h - 1.7 * cm, "基线")
    canvas.setFillColor(colors.HexColor("#CFC6B6"))
    canvas.drawString(MARGIN_L + 1.2 * cm, band_h - 1.7 * cm,
                      "tsc 0 error · 26 个单测全绿 · next build 成功 · 首页 First Load JS 139 kB")
    canvas.setFillColor(colors.HexColor("#9C9486"))
    canvas.setFont("YaHei", 8.5)
    canvas.drawString(MARGIN_L, band_h - 2.3 * cm, "v1.0 · 2026 年 11 月 · 省赛作品")
    canvas.restoreState()


def draw_body(canvas, doc):
    canvas.saveState()
    canvas.setFont("Deng", 8)
    canvas.setFillColor(colors.HexColor("#8B8478"))
    canvas.drawString(MARGIN_L, 1.2 * cm, "赛博卦账 · Cyber Oracle · 技术文档")
    canvas.drawRightString(PAGE_W - MARGIN_R, 1.2 * cm, f"{doc.page}")
    canvas.setStrokeColor(GRID)
    canvas.setLineWidth(0.4)
    canvas.line(MARGIN_L, 1.6 * cm, PAGE_W - MARGIN_R, 1.6 * cm)
    canvas.restoreState()


def main() -> int:
    if not MD_PATH.exists():
        print(f"缺少源文件：{MD_PATH}")
        return 1
    register_fonts()
    md = MD_PATH.read_text(encoding="utf-8")

    doc = BaseDocTemplate(
        str(PDF_PATH),
        pagesize=A4,
        leftMargin=MARGIN_L,
        rightMargin=MARGIN_R,
        topMargin=MARGIN_T,
        bottomMargin=MARGIN_B,
        title="赛博卦账 · 技术文档",
        author="Cyber Oracle Dev",
        subject="全国高校 Vibe Coding 开发挑战赛 · 省赛技术文档",
    )
    frame = Frame(MARGIN_L, MARGIN_B, PAGE_W - MARGIN_L - MARGIN_R, PAGE_H - MARGIN_T - MARGIN_B, id="body")
    cover_frame = Frame(MARGIN_L, MARGIN_B, PAGE_W - MARGIN_L - MARGIN_R, PAGE_H * 0.52, id="cover")
    doc.addPageTemplates([
        PageTemplate(id="cover", frames=[cover_frame], onPage=draw_cover),
        PageTemplate(id="body", frames=[frame], onPage=draw_body),
    ])

    blocks = parse_blocks(md)
    story = build_story(blocks, PAGE_W - MARGIN_L - MARGIN_R)

    # 第一页只画封面（封面内容由 draw_cover 负责），正文从第二页开始
    story.insert(0, PageBreak())
    from reportlab.platypus import NextPageTemplate
    story.insert(0, NextPageTemplate("body"))

    doc.build(story)
    print(f"已生成 {PDF_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
