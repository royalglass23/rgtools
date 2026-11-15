"""Read-only extraction of legacy Work Order manual fields using Python's standard library."""
import hashlib
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET
from zipfile import ZipFile

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
KNOWN = {'client waiting for', 'site ready', 'glass ready', 'hardware ready', 'design confirmed',
         'ps1 needed', 'ps3 needed', 'mv needed', 'notes', '售后', '安装人员', 'installer',
         'install date (approx)', 'within 3 weeks?'}

def cell_value(cell, strings):
    value = cell.find('m:v', NS)
    value = value.text if value is not None else ''
    if cell.attrib.get('t') == 's' and value:
        return strings[int(value)]
    inline = cell.find('m:is', NS)
    return ''.join(inline.itertext()) if inline is not None else (value or '')

def extract(directory):
    files, records, seen = [], [], {}
    names = ['RG Kanban.xlsx', 'RG_Kanban.xlsx', 'RG_Kanban.xlsx.backup-before-refresh-20261116-0810.xlsx',
             'RG_Kanban.xlsx.backup-roxy-20261115-1955.xlsx', 'RG_Kanban.xlsx.20261115-1940.bak', 'TableB_WO_3wk.xlsx']
    for name in names:
        filename = directory / name
        if not filename.exists():
            files.append({'name': name, 'missing': True})
            continue
        digest = hashlib.sha256(filename.read_bytes()).hexdigest()
        if digest in seen:
            files.append({'name': name, 'sha256': digest, 'duplicateOf': seen[digest]})
            continue
        seen[digest] = name
        files.append({'name': name, 'sha256': digest})
        with ZipFile(filename) as z:
            strings = []
            if 'xl/sharedStrings.xml' in z.namelist():
                strings = [''.join(si.itertext()) for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS)]
            rels = {el.attrib['Id']: el.attrib['Target'] for el in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
            for sheet in ET.fromstring(z.read('xl/workbook.xml')).findall('m:sheets/m:sheet', NS):
                title = sheet.attrib['name']
                if title not in ['Master', 'B3 Work Orders', '_Manual archive', 'Table B']:
                    continue
                target = rels[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
                target = target.lstrip('/') if target.startswith('/') else 'xl/' + target
                headers = {}
                for row in ET.fromstring(z.read(target)).findall('m:sheetData/m:row', NS):
                    values = {re.sub(r'\d', '', c.attrib['r']): cell_value(c, strings) for c in row.findall('m:c', NS)}
                    if any(v in ['Job#', 'Job No', 'job_number'] for v in values.values()):
                        headers = values
                        continue
                    if not headers:
                        continue
                    job_col = next((c for c, v in headers.items() if v in ['Job#', 'Job No', 'job_number']), None)
                    job = values.get(job_col, '').strip()
                    if not job:
                        continue
                    if title == 'Master':
                        status_col = next((c for c, v in headers.items() if v == 'Status'), None)
                        if values.get(status_col) != 'Work Order':
                            continue
                    item_col = next((c for c, v in headers.items() if v == 'Item'), None)
                    for col, header in headers.items():
                        v = values.get(col, '')
                        manual = '(manual)' in header.lower() or header.lower() in KNOWN or (title == '_Manual archive' and header != 'job_number')
                        if v != '' and manual:
                            records.append({'file': name, 'sheet': title, 'cell': col + row.attrib['r'],
                                            'jobNumber': job, 'item': values.get(item_col) or None,
                                            'field': header, 'value': v, 'disposition': 'review-required'})
    return {'dryRun': True, 'files': files, 'manualValues': records}

if __name__ == '__main__':
    print(json.dumps(extract(Path(sys.argv[1])), ensure_ascii=True))
