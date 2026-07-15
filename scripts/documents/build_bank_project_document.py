#!/usr/bin/env python3
"""Generate neutral, serious banking-project DOCX/PDF document starters.

The generator deliberately creates no institution logo, account data, credential,
or production configuration. It is a dual-output handover of the verified
Markdown-to-Word/PDF idea used in D:\\Agent\\01-math-modeling, with bank-project
document controls and a red/white/black visual system.
"""
from __future__ import annotations

import argparse
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

INK = "161616"
RED = "A6192E"
GRAY = "525252"
MIST = "F4F4F4"
PDF_CJK = "STSong-Light"

SECTIONS = {
    "initiation": ["项目背景与目标", "范围、边界与假设", "可行性与方案比选", "风险、数据与安全初评", "治理、RACI 与里程碑", "审批意见"],
    "requirements": ["业务背景与范围", "角色、流程与规则", "功能需求", "非功能与合规需求", "数据、接口与权限", "需求追踪与验收标准"],
    "design": ["总体架构", "模块与接口设计", "数据模型与数据流", "安全、审计与可观测性", "部署、迁移与回退", "设计评审结论"],
    "test": ["测试范围与策略", "环境、数据与职责", "用例与需求追踪", "入口/出口准则", "缺陷与风险管理", "测试结论与建议"],
    "release": ["版本与变更范围", "上线前置检查", "实施步骤与时间窗", "监控、验证与值守", "回退条件与步骤", "投产审批与实施记录"],
    "acceptance": ["验收依据与范围", "交付物核验", "测试与 UAT 结论", "培训与运维移交", "遗留事项与风险", "验收结论与签署"],
    "handover": ["交付资产清单", "安装部署说明", "运维与应急说明", "培训与知识移交", "审计归档与保留期", "项目复盘与关闭"],
}

TYPE_LABELS = {
    "initiation": "项目立项报告",
    "requirements": "需求规格说明书",
    "design": "系统设计说明书",
    "test": "测试计划与报告",
    "release": "上线实施与回退方案",
    "acceptance": "项目验收报告",
    "handover": "交付与运维移交手册",
}


def set_cell_fill(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), fill)
    tc_pr.append(shd)


def set_font(run, name: str, size: float, color: str = INK, bold: bool = False) -> None:
    run.font.name = name
    run._element.rPr.rFonts.set(qn("w:ascii"), name)
    run._element.rPr.rFonts.set(qn("w:hAnsi"), name)
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "SimSun")
    run.font.size = Pt(size)
    run.font.color.rgb = RGBColor.from_string(color)
    run.bold = bold


def add_bottom_border(paragraph, color: str = RED) -> None:
    p_pr = paragraph._p.get_or_add_pPr()
    borders = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "12")
    bottom.set(qn("w:space"), "6")
    bottom.set(qn("w:color"), color)
    borders.append(bottom)
    p_pr.append(borders)


def add_table(doc: Document, rows: list[tuple[str, str]]) -> None:
    table = doc.add_table(rows=len(rows), cols=2)
    table.style = "Table Grid"
    table.autofit = False
    for row, (label, value) in zip(table.rows, rows):
        row.cells[0].width = Cm(4.1)
        row.cells[1].width = Cm(12.3)
        set_cell_fill(row.cells[0], MIST)
        for cell, text, bold in ((row.cells[0], label, True), (row.cells[1], value, False)):
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            run = p.add_run(text)
            set_font(run, "Arial", 9.5, INK, bold)
    doc.add_paragraph()


def configure_doc(doc: Document, doc_type: str, project_code: str) -> None:
    section = doc.sections[0]
    section.top_margin, section.bottom_margin = Cm(2.54), Cm(2.54)
    section.left_margin, section.right_margin = Cm(3.17), Cm(3.17)
    section.header_distance, section.footer_distance = Cm(1.25), Cm(1.25)
    normal = doc.styles["Normal"]
    normal.font.name = "SimSun"
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "SimSun")
    normal.font.size = Pt(10.5)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.25
    for style_name, size in (("Heading 1", 16), ("Heading 2", 13)):
        style = doc.styles[style_name]
        style.font.name = "SimHei"
        style._element.rPr.rFonts.set(qn("w:eastAsia"), "SimHei")
        style.font.size = Pt(size)
        style.font.color.rgb = RGBColor.from_string(RED)
    header = section.header.paragraphs[0]
    header.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run = header.add_run(f"{project_code}  |  {doc_type.upper()}  |  受控副本")
    set_font(run, "Arial", 8.5, GRAY, True)
    add_bottom_border(header, RED)
    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = footer.add_run("仅限项目用途 | 第 ")
    set_font(run, "Arial", 8.5, GRAY)
    field = OxmlElement("w:fldSimple")
    field.set(qn("w:instr"), "PAGE")
    footer._p.append(field)
    run = footer.add_run(" 页")
    set_font(run, "Arial", 8.5, GRAY)


def build_docx(output: Path, document_type: str, title: str, project_code: str) -> None:
    doc = Document()
    type_label = TYPE_LABELS[document_type]
    configure_doc(doc, type_label, project_code)
    cover = doc.add_table(rows=3, cols=1)
    cover.autofit = False
    for row in cover.rows:
        row.cells[0].width = Cm(16.4)
    set_cell_fill(cover.cell(0, 0), INK)
    set_cell_fill(cover.cell(2, 0), RED)
    p = cover.cell(0, 0).paragraphs[0]
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after = Pt(10)
    run = p.add_run("BANK PROJECT DOCUMENT")
    set_font(run, "Arial", 12, "FFFFFF", True)
    p = cover.cell(1, 0).paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(74)
    p.paragraph_format.space_after = Pt(74)
    run = p.add_run(title)
    set_font(run, "SimHei", 24, INK, True)
    p = cover.cell(2, 0).paragraphs[0]
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(8)
    run = p.add_run(project_code)
    set_font(run, "Arial", 10, "FFFFFF", True)
    doc.add_page_break()
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("文档控制信息")
    set_font(run, "SimHei", 18, INK, True)
    add_bottom_border(p)
    add_table(doc, [("文书类型", type_label), ("项目名称", title), ("项目编号", project_code), ("版本", "V0.1 草案"), ("状态", "待编制/待审批"), ("编制/复核/批准", "【待填写】/【待填写】/【待填写】"), ("关联编号", "需求/变更/测试/验收编号【待填写】")])
    doc.add_page_break()
    for index, section_title in enumerate(SECTIONS[document_type], 1):
        doc.add_heading(f"{index}. {section_title}", level=1)
        p = doc.add_paragraph()
        run = p.add_run("【待填写】")
        set_font(run, "SimSun", 10.5, GRAY)
        if section_title in {"治理、RACI 与里程碑", "需求追踪与验收标准", "测试与 UAT 结论", "交付资产清单"}:
            add_table(doc, [("责任人", "【待填写】"), ("输入/关联证据", "【待填写】"), ("审批/结论", "【待填写】")])
    doc.save(output)


def build_pdf(output: Path, document_type: str, title: str, project_code: str) -> None:
    pdfmetrics.registerFont(UnicodeCIDFont(PDF_CJK))
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("bank-title", parent=styles["Title"], fontName=PDF_CJK, fontSize=22, leading=28, textColor=colors.HexColor("#161616"), alignment=1)
    heading_style = ParagraphStyle("bank-h1", parent=styles["Heading1"], fontName=PDF_CJK, fontSize=14, leading=18, textColor=colors.HexColor("#A6192E"), spaceBefore=12, spaceAfter=6)
    body_style = ParagraphStyle("bank-body", parent=styles["BodyText"], fontName=PDF_CJK, fontSize=10, leading=15, textColor=colors.HexColor("#161616"))
    doc = SimpleDocTemplate(str(output), pagesize=A4, rightMargin=31.7 * mm, leftMargin=31.7 * mm, topMargin=25.4 * mm, bottomMargin=25.4 * mm)
    story = [Spacer(1, 35 * mm), Table([[Paragraph("BANK PROJECT DOCUMENT", ParagraphStyle("cover-kicker", parent=body_style, textColor=colors.white, fontName="Helvetica-Bold", alignment=1))]], colWidths=[145 * mm], rowHeights=[15 * mm], style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#161616")), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")])), Spacer(1, 36 * mm), Paragraph(title, title_style), Spacer(1, 32 * mm), Table([[Paragraph(project_code, ParagraphStyle("cover-footer", parent=body_style, textColor=colors.white, alignment=1, fontName=PDF_CJK))]], colWidths=[145 * mm], rowHeights=[12 * mm], style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#A6192E"))])), PageBreak(), Paragraph("文档控制信息", title_style)]
    rows = [["文书类型", TYPE_LABELS[document_type]], ["项目名称", title], ["项目编号", project_code], ["版本", "V0.1 草案"], ["状态", "待编制/待审批"]]
    control = Table(rows, colWidths=[35 * mm, 110 * mm])
    control.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#161616")), ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F4F4F4")), ("FONTNAME", (0, 0), (-1, -1), PDF_CJK), ("FONTSIZE", (0, 0), (-1, -1), 9), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7)]))
    story += [Spacer(1, 8 * mm), control, PageBreak()]
    for index, section_title in enumerate(SECTIONS[document_type], 1):
        story += [Paragraph(f"{index}. {section_title}", heading_style), Paragraph("【待填写】本节应关联唯一需求、变更、测试或验收编号，并保留相应审批与证据。", body_style), Spacer(1, 5 * mm)]
    doc.build(story)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate a red/white/black bank-project document starter.")
    parser.add_argument("--document-type", choices=sorted(SECTIONS), required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--project-code", required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--format", choices=("docx", "pdf", "both"), default="both")
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    stem = f"{args.project_code}_{args.document_type}"
    if args.format in {"docx", "both"}:
        build_docx(args.output_dir / f"{stem}.docx", args.document_type, args.title, args.project_code)
    if args.format in {"pdf", "both"}:
        build_pdf(args.output_dir / f"{stem}.pdf", args.document_type, args.title, args.project_code)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
