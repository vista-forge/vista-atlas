// Parse and render the extracted-table CSV sidecars (`tables/table-NN.csv`) the producer lifts out
// of large tables. The reading pane fetches a doc's CSV from /api/table and renders it inline where
// the `[Table N (extracted to CSV)]` link sat — so the table is read in place, not lost to a link.

// parseCsv parses RFC-4180-style CSV into rows of string cells: comma-separated, CRLF or LF line
// ends, double-quoted fields (quotes escaped by doubling) that may contain commas/quotes/newlines.
// A trailing newline does not yield a spurious empty row.
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;
	let started = false; // any char seen for the current record (so we know a final row is real)
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					quoted = false;
				}
			} else {
				field += c;
			}
			continue;
		}
		if (c === '"') {
			quoted = true;
			started = true;
		} else if (c === ',') {
			row.push(field);
			field = '';
			started = true;
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && text[i + 1] === '\n') i++;
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
			started = false;
		} else {
			field += c;
			started = true;
		}
	}
	if (started || field !== '' || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// csvToTableHtml renders parsed rows as an HTML <table> — row 0 is the header. Each cell is passed
// through renderCell (default: HTML-escape); the reading pane supplies an inline-markdown renderer
// so cell emphasis/code (e.g. **EN^DIK**) renders like the rest of the body. The caller sanitizes
// the result before injecting it.
export function csvToTableHtml(rows: string[][], renderCell: (s: string) => string = escapeHtml): string {
	if (!rows.length) return '';
	const cells = (tag: 'th' | 'td', r: string[]) =>
		r.map((c) => `<${tag}>${renderCell(c)}</${tag}>`).join('');
	const head = `<thead><tr>${cells('th', rows[0])}</tr></thead>`;
	const body = rows
		.slice(1)
		.map((r) => `<tr>${cells('td', r)}</tr>`)
		.join('');
	return `<table>${head}<tbody>${body}</tbody></table>`;
}
