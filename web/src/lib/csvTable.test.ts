import assert from 'node:assert/strict';
import { test } from 'node:test';
import { csvToTableHtml, parseCsv } from './csvTable';

test('parseCsv handles a simple grid', () => {
	assert.deepEqual(parseCsv('a,b\n1,2\n'), [
		['a', 'b'],
		['1', '2'],
	]);
});

test('parseCsv handles quoted fields with commas, quotes, and newlines', () => {
	const csv = '"a,b","he said ""hi""","line1\nline2"\r\nx,y,z\r\n';
	assert.deepEqual(parseCsv(csv), [
		['a,b', 'he said "hi"', 'line1\nline2'],
		['x', 'y', 'z'],
	]);
});

test('parseCsv drops a trailing blank line but keeps empty fields', () => {
	assert.deepEqual(parseCsv('a,,c\n'), [['a', '', 'c']]);
});

test('csvToTableHtml builds a thead from row 0 and tbody from the rest', () => {
	const html = csvToTableHtml([
		['Variable', 'Default'],
		['DT', '$H'],
	]);
	assert.match(html, /<table><thead><tr><th>Variable<\/th><th>Default<\/th><\/tr><\/thead>/);
	assert.match(html, /<tbody><tr><td>DT<\/td><td>\$H<\/td><\/tr><\/tbody>/);
});

test('csvToTableHtml escapes cell text by default', () => {
	const html = csvToTableHtml([['<x>'], ['a & b']]);
	assert.match(html, /<th>&lt;x&gt;<\/th>/);
	assert.match(html, /<td>a &amp; b<\/td>/);
});

test('csvToTableHtml uses a custom cell renderer when given', () => {
	const html = csvToTableHtml([['H'], ['**b**']], (s) => s.replace(/\*\*(.+?)\*\*/, '<b>$1</b>'));
	assert.match(html, /<td><b>b<\/b><\/td>/);
});

test('csvToTableHtml returns empty string for no rows', () => {
	assert.equal(csvToTableHtml([]), '');
});
