"""Export a controlled Markdown source to an unreviewed DOCX draft.

Run with the bundled document Python. Rendering and every-page visual review
remain required before delivery. The catalog, not this exporter, selects sources.
"""
import argparse
from pathlib import Path
import re

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


def inline(paragraph, value, references):
    pattern = r'(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))'
    for part in re.split(pattern, value):
        if part.startswith('`') and part.endswith('`'):
            run = paragraph.add_run(part[1:-1])
            run.font.name = 'Consolas'
        elif part.startswith('**') and part.endswith('**'):
            paragraph.add_run(part[2:-2]).bold = True
        elif (link := re.fullmatch(r'\[([^\]]+)\]\(([^)]+)\)', part)):
            label, target = link.groups()
            if target not in references:
                references.append(target)
            paragraph.add_run(f'{label} [{references.index(target) + 1}]')
        else:
            paragraph.add_run(part)


def comparison(document, rows, references):
    table = document.add_table(rows=0, cols=len(rows[0]))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for index, values in enumerate(rows):
        row = table.add_row()
        row._tr.get_or_add_trPr().append(OxmlElement('w:cantSplit'))
        for cell, value in zip(row.cells, values):
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            inline(cell.paragraphs[0], value, references)
            cell.paragraphs[0].paragraph_format.space_after = Pt(5)
            if index == 0:
                cell.paragraphs[0].paragraph_format.keep_with_next = True
            properties = cell._tc.get_or_add_tcPr()
            borders = OxmlElement('w:tcBorders')
            for edge in ('top', 'left', 'bottom', 'right'):
                item = OxmlElement(f'w:{edge}')
                for key, setting in {'val': 'single', 'sz': '4', 'color': 'D9D9D9'}.items():
                    item.set(qn(f'w:{key}'), setting)
                borders.append(item)
            properties.append(borders)
            margins = OxmlElement('w:tcMar')
            for edge in ('top', 'bottom', 'left', 'right'):
                item = OxmlElement(f'w:{edge}')
                item.set(qn('w:w'), '100')
                item.set(qn('w:type'), 'dxa')
                margins.append(item)
            properties.append(margins)
            if index == 0:
                shading = OxmlElement('w:shd')
                shading.set(qn('w:fill'), 'EAEFF4')
                properties.append(shading)
                for run in cell.paragraphs[0].runs:
                    run.bold = True
        if index == 0:
            row._tr.get_or_add_trPr().append(OxmlElement('w:tblHeader'))
    # Narrative columns retain more room than a short ID/status column.
    if len(rows[0]) >= 3:
        first_width = 0.9 if rows[0][0] in ('ID', '清单', '要求') else 1.8
        widths = [first_width] + [(6.5 - first_width) / (len(rows[0]) - 1)] * (len(rows[0]) - 1)
        table.autofit = False
        for row in table.rows:
            for cell, width in zip(row.cells, widths):
                cell.width = Inches(width)
    document.add_paragraph()


def export(source, output, repository):
    source.relative_to(repository / 'docs' / 'design' / 'product-normalization')
    output.relative_to(repository / 'deliverables')
    if output.exists():
        raise FileExistsError('DOCUMENT_OUTPUT_EXISTS')
    text = source.read_text(encoding='utf-8-sig')
    text = re.sub(r'\A---\r?\n.*?\r?\n---\r?\n', '', text, count=1, flags=re.S)
    document = Document()
    section = document.sections[0]
    section.page_width, section.page_height = Inches(8.5), Inches(11)
    section.left_margin = section.right_margin = Inches(1)
    section.top_margin = section.bottom_margin = Inches(0.85)
    for name, size in [('Normal', 11), ('Title', 22), ('Heading 1', 15), ('Heading 2', 12), ('Heading 3', 11)]:
        style = document.styles[name]
        style.font.name, style.font.size = 'Arial', Pt(size)
        style.font.color.rgb = RGBColor(0, 0, 0)
        for border in list(style.element.get_or_add_pPr().findall(qn('w:pBdr'))):
            border.getparent().remove(border)
        style.element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'), 'Microsoft YaHei')
        style.paragraph_format.space_after = Pt(7)
    document.styles['Normal'].paragraph_format.line_spacing = 1.25
    document.core_properties.author = 'Codex'
    document.core_properties.subject = '本地规范源稿导出 未完成渲染验页及最终签收'
    references, paragraph_lines, table_rows = [], [], []
    code = False

    def flush():
        if paragraph_lines:
            inline(document.add_paragraph(), ' '.join(paragraph_lines), references)
            paragraph_lines.clear()
        if table_rows:
            comparison(document, table_rows, references)
            table_rows.clear()

    for line in text.splitlines():
        if line.startswith('```'):
            flush()
            code = not code
        elif code:
            paragraph = document.add_paragraph()
            paragraph.paragraph_format.space_after = Pt(2)
            run = paragraph.add_run(line)
            run.font.name, run.font.size = 'Consolas', Pt(10)
        elif not line.strip():
            flush()
        elif (heading := re.match(r'^(#{1,4})\s+(.+)$', line)):
            flush()
            level, title = len(heading[1]), heading[2]
            if level == 1:
                document.add_paragraph(title, 'Title')
                document.core_properties.title = title
            else:
                document.add_heading(title, level=min(level - 1, 3))
        elif line.startswith('|'):
            if paragraph_lines:
                flush()
            if not re.fullmatch(r'\|[\s:|\-]+\|', line):
                table_rows.append([value.strip() for value in line.strip('|').split('|')])
        elif (item := re.match(r'^\s*(?:[-*]|\d+\.)\s+(.+)$', line)):
            flush()
            paragraph = document.add_paragraph(style='List Bullet' if line.lstrip().startswith(('-', '*')) else 'List Number')
            inline(paragraph, item[1], references)
        else:
            if table_rows:
                flush()
            paragraph_lines.append(line)
    flush()
    if references:
        reference_paragraph = document.add_paragraph()
        reference_paragraph.paragraph_format.line_spacing = 1.05
        reference_paragraph.paragraph_format.space_before = Pt(6)
        reference_paragraph.add_run('引用资料 ').bold = True
        for index, target in enumerate(references, 1):
            if not re.match(r'^https?://', target):
                path, *fragment = target.split('#', 1)
                target = (source.parent / path).resolve().relative_to(repository).as_posix()
                if fragment:
                    target += '#' + fragment[0]
            reference_paragraph.add_run(('\n' if index > 1 else '') + f'[{index}] {target}')
        for run in reference_paragraph.runs:
            run.font.size = Pt(9.5)
    output.parent.mkdir(parents=True, exist_ok=True)
    document.save(output)
    print(f'DOCUMENT_DRAFT_CREATED paragraphs={len(document.paragraphs)} tables={len(document.tables)} rendered=false')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    arguments = parser.parse_args()
    export(arguments.source.resolve(), arguments.output.resolve(), Path(__file__).resolve().parents[2])
