"""Convert the official CoFID workbook with Python's standard library only.
Usage: python3 scripts/import_cofid.py /path/to/CoFID.xlsx
"""
import hashlib
import json
import math
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parent.parent
SOURCE = 'https://assets.publishing.service.gov.uk/media/60538b91e90e07527df82ae4/McCance_Widdowsons_Composition_of_Foods_Integrated_Dataset_2021..xlsx'
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def convert(path):
    with ZipFile(path) as archive:
        strings = [''.join(e.itertext()) for e in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('s:si', NS)]
        workbook = ET.fromstring(archive.read('xl/workbook.xml'))
        sheet = next(s for s in workbook.findall('s:sheets/s:sheet', NS) if s.get('name') == '1.3 Proximates')
        rel_id = sheet.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
        relationships = ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))
        target = next(r.get('Target') for r in relationships if r.get('Id') == rel_id)
        root = ET.fromstring(archive.read('xl/' + target))
        rows = []
        for row in root.findall('s:sheetData/s:row', NS):
            values = {}
            for cell in row.findall('s:c', NS):
                value = cell.findtext('s:v', default='', namespaces=NS)
                values[re.sub(r'\d', '', cell.get('r'))] = strings[int(value)] if cell.get('t') == 's' else value
            rows.append(values)
    assert rows[0]['A'] == 'Food Code' and rows[1]['M'] == 'KCALS', 'Workbook columns changed'
    foods, skipped = [], 0
    for row_number, row in enumerate(rows[3:], start=4):
        if not re.fullmatch(r'\d{2}-\d{3,4}', row.get('A', '')):
            continue
        try:
            kcal = float(row.get('M', ''))
        except ValueError:
            skipped += 1
            continue  # N, blank and Tr are not silently treated as zero.
        if not math.isfinite(kcal) or not 0 <= kcal <= 10000:
            raise ValueError('Unexpected energy for ' + row['A'])
        foods.append(dict(id=row['A'], code=row['A'], row=row_number, name=row['B'], group=row['D'], kcalPer100=kcal, basis='ml' if row['D'].startswith('Q') else 'g'))
    counts = {}
    for food in foods:
        counts[food['code']] = counts.get(food['code'], 0) + 1
    for food in foods:
        if counts[food['code']] > 1:
            food['id'] += '-r' + str(food['row'])
        del food['row']
    assert len({food['id'] for food in foods}) == len(foods)
    return dict(version='CoFID 2021', source=SOURCE, sha256=hashlib.sha256(Path(path).read_bytes()).hexdigest(), omittedWithoutNumericEnergy=skipped, foods=foods)
if __name__ == '__main__':
    data = convert(sys.argv[1])
    target = ROOT / 'nutrition' / 'cofid.json'
    target.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f"Imported {len(data['foods'])} foods; skipped {data['omittedWithoutNumericEnergy']} without numeric kcal.")
