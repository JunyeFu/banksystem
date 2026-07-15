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
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
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

DOCUMENT_RULES = {
    "适用范围": "本模板用于项目过程与交付文书，不作为党政机关正式发文格式。",
    "编号规则": "需求、变更、测试、缺陷、上线与验收记录均使用稳定编号；编号、日期、金额和版本号不得拆行。",
    "验收措辞": "使用“应、必须、不得、已完成、未通过、待整改”等可验证表述；每项结论须关联责任人和证据编号。",
}

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

SECTION_GUIDANCE = {
    "项目背景与目标": "说明立项原因、业务痛点、预期收益和衡量指标；应明确范围边界与不纳入事项。",
    "范围、边界与假设": "列出交付范围、依赖条件、约束和排除项；每项假设应具备验证方式。",
    "可行性与方案比选": "比较候选方案的成本、风险、合规性、可运维性和推荐结论。",
    "风险、数据与安全初评": "识别数据、接口、权限、连续性和供应商风险，明确控制措施与责任人。",
    "治理、RACI 与里程碑": "明确决策、执行、复核和知会角色，以及里程碑、输入和退出条件。",
    "审批意见": "记录批准、附条件批准或退回结论；未通过事项应写明整改责任人与截止日期。",
    "业务背景与范围": "说明业务目标、用户范围、流程边界和不包含事项。",
    "角色、流程与规则": "按角色描述触发条件、处理步骤、异常分支、业务规则和权限边界。",
    "功能需求": "每项需求应包含需求编号、前置条件、操作、预期结果、优先级和验收标准。",
    "非功能与合规需求": "明确性能、可用性、审计、保留、脱敏、容量及监管/内控约束。",
    "数据、接口与权限": "说明数据口径、字段、来源、接口契约、错误处理、权限和审计要求。",
    "需求追踪与验收标准": "将需求编号关联设计、实现、测试、上线和验收证据。",
    "总体架构": "说明系统边界、组件职责、依赖关系、部署视图和关键技术决策。",
    "模块与接口设计": "按模块或接口编号描述输入、输出、校验、错误码、幂等和版本兼容策略。",
    "数据模型与数据流": "说明实体、字段口径、数据流向、保留期限、脱敏和质量控制。",
    "安全、审计与可观测性": "说明认证授权、最小权限、审计事件、日志脱敏、监控指标和告警责任。",
    "部署、迁移与回退": "说明环境隔离、发布顺序、数据迁移、验证点、回退条件和回退步骤。",
    "设计评审结论": "记录评审范围、结论、问题、责任人、整改期限和证据链接。",
    "测试范围与策略": "说明测试对象、覆盖范围、测试类型、优先级和不测试项。",
    "环境、数据与职责": "说明环境版本、数据来源与脱敏要求、角色职责和访问边界。",
    "用例与需求追踪": "每个用例应关联唯一需求编号、执行记录、结果、缺陷和证据。",
    "入口/出口准则": "明确开始/结束测试的可量化条件、阻塞项和例外审批。",
    "缺陷与风险管理": "按严重性、影响、责任人、目标版本和关闭证据跟踪问题。",
    "测试结论与建议": "给出通过、附条件通过或不通过结论；遗留风险应可追踪且有处置期限。",
    "版本与变更范围": "列明版本号、变更编号、影响组件、数据变更和不包含事项。",
    "上线前置检查": "逐项核验审批、备份、监控、容量、权限、应急联系人和回退准备。",
    "实施步骤与时间窗": "按顺序列出执行人、时间窗、操作、验证点和失败处置。",
    "监控、验证与值守": "明确关键指标、验收交易、观察时段、值守责任和升级路径。",
    "回退条件与步骤": "定义可触发的量化条件、决策人、回退顺序、数据处理和验证方法。",
    "投产审批与实施记录": "记录审批结论、实际开始/结束时间、异常、执行人和上线证据。",
    "验收依据与范围": "列出合同/需求/变更/测试依据、验收范围、排除项和责任边界。",
    "交付物核验": "按交付物名称、版本、位置、核验人和核验结果逐项确认。",
    "测试与 UAT 结论": "引用测试/UAT 证据并说明通过范围、未通过项和豁免依据。",
    "培训与运维移交": "确认培训对象、材料、运维职责、知识库、监控和应急联系人。",
    "遗留事项与风险": "每项遗留项必须有风险说明、责任人、计划日期和批准意见。",
    "验收结论与签署": "明确验收结论和签署角色；附条件验收须列明关闭标准。",
    "交付资产清单": "列出代码、部署包、配置说明、接口文档、测试证据和许可证等资产。",
    "安装部署说明": "说明前置条件、环境参数来源、安装步骤、验证点和故障处理。",
    "运维与应急说明": "说明日常巡检、监控、告警、备份恢复、事件分级与升级路径。",
    "培训与知识移交": "说明培训范围、材料、签到/考核证据和知识库维护责任。",
    "审计归档与保留期": "说明归档目录、证据编号、访问授权、保存期限和销毁审批。",
    "项目复盘与关闭": "记录目标达成、偏差、经验、遗留事项和正式关闭确认。",
}

SECTION_TABLES = {
    "initiation": ("治理、RACI 与里程碑", ["事项/里程碑", "责任人", "计划日期", "退出条件/证据编号"]),
    "requirements": ("需求追踪与验收标准", ["需求编号", "验收标准", "测试/证据编号", "状态"]),
    "design": ("模块与接口设计", ["模块/接口编号", "输入与输出", "校验/错误处理", "审计要求"]),
    "test": ("用例与需求追踪", ["用例编号", "需求编号", "预期结果", "执行结果/证据"]),
    "release": ("实施步骤与时间窗", ["步骤", "执行人", "验证点", "失败处置"]),
    "acceptance": ("交付物核验", ["交付物", "版本/位置", "核验结果", "证据编号"]),
    "handover": ("交付资产清单", ["资产", "版本/位置", "接收责任人", "移交证据"]),
}


def set_cell_fill(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), fill)
    tc_pr.append(shd)


def set_cell_margins(cell, top: int = 80, start: int = 120, bottom: int = 80, end: int = 120) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    margins = tc_pr.first_child_found_in("w:tcMar")
    if margins is None:
        margins = OxmlElement("w:tcMar")
        tc_pr.append(margins)
    for side, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = margins.find(qn(f"w:{side}"))
        if node is None:
            node = OxmlElement(f"w:{side}")
            margins.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_table_geometry(table, widths_cm: list[float]) -> None:
    table.autofit = False
    table_pr = table._tbl.tblPr
    table_width = OxmlElement("w:tblW")
    table_width.set(qn("w:w"), str(int(sum(widths_cm) * 567)))
    table_width.set(qn("w:type"), "dxa")
    table_pr.append(table_width)
    indent = OxmlElement("w:tblInd")
    indent.set(qn("w:w"), "120")
    indent.set(qn("w:type"), "dxa")
    table_pr.append(indent)
    grid = table._tbl.tblGrid
    for col, width in zip(grid.gridCol_lst, widths_cm):
        col.set(qn("w:w"), str(int(width * 567)))
    for row in table.rows:
        for cell, width in zip(row.cells, widths_cm):
            cell.width = Cm(width)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            set_cell_margins(cell)


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
    set_table_geometry(table, [4.1, 12.3])
    for row, (label, value) in zip(table.rows, rows):
        set_cell_fill(row.cells[0], MIST)
        for cell, text, bold in ((row.cells[0], label, True), (row.cells[1], value, False)):
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.15
            run = p.add_run(text)
            set_font(run, "Arial", 9.5, INK, bold)
    doc.add_paragraph()


def add_matrix(doc: Document, headers: list[str]) -> None:
    table = doc.add_table(rows=2, cols=len(headers))
    table.style = "Table Grid"
    widths = [16.4 / len(headers)] * len(headers)
    set_table_geometry(table, widths)
    for index, header in enumerate(headers):
        cell = table.cell(0, index)
        set_cell_fill(cell, MIST)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(0)
        run = p.add_run(header)
        set_font(run, "Arial", 9, INK, True)
        body = table.cell(1, index).paragraphs[0]
        body.paragraph_format.space_after = Pt(0)
        run = body.add_run("【待填写】")
        set_font(run, "SimSun", 9, GRAY)
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
    normal.paragraph_format.first_line_indent = Cm(0.74)
    for style_name, size in (("Heading 1", 16), ("Heading 2", 13)):
        style = doc.styles[style_name]
        style.font.name = "SimHei"
        style._element.rPr.rFonts.set(qn("w:eastAsia"), "SimHei")
        style.font.size = Pt(size)
        style.font.color.rgb = RGBColor.from_string(RED)
        style.paragraph_format.space_before = Pt(14 if style_name == "Heading 1" else 10)
        style.paragraph_format.space_after = Pt(7 if style_name == "Heading 1" else 5)
        style.paragraph_format.keep_with_next = True
        style.paragraph_format.first_line_indent = Cm(0)
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
        run = p.add_run(f"【待填写】{SECTION_GUIDANCE[section_title]}")
        set_font(run, "SimSun", 10.5, GRAY)
        if section_title == SECTION_TABLES[document_type][0]:
            add_matrix(doc, SECTION_TABLES[document_type][1])
    doc.add_page_break()
    doc.add_heading("填写与复核规则", level=1)
    for label, rule in DOCUMENT_RULES.items():
        p = doc.add_paragraph()
        p.paragraph_format.first_line_indent = Cm(0)
        name = p.add_run(f"{label}：")
        set_font(name, "SimHei", 10.5, INK, True)
        value = p.add_run(rule)
        set_font(value, "SimSun", 10.5, GRAY)
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
        story += [Paragraph(f"{index}. {section_title}", heading_style), Paragraph(f"【待填写】{SECTION_GUIDANCE[section_title]}", body_style)]
        if section_title == SECTION_TABLES[document_type][0]:
            headers = SECTION_TABLES[document_type][1]
            matrix = Table([headers, ["【待填写】"] * len(headers)], colWidths=[145 * mm / len(headers)] * len(headers))
            matrix.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#161616")), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F4F4F4")), ("FONTNAME", (0, 0), (-1, -1), PDF_CJK), ("FONTSIZE", (0, 0), (-1, -1), 8), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (0, 0), (-1, 0), "CENTER"), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
            story += [Spacer(1, 3 * mm), matrix]
        story += [Spacer(1, 5 * mm)]
    story += [PageBreak(), Paragraph("填写与复核规则", heading_style)]
    for label, rule in DOCUMENT_RULES.items():
        story += [Paragraph(f"<b>{label}：</b>{rule}", body_style)]
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
