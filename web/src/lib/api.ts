// Typed client for the vdocs-web JSON API (served by the Go backend over pkg/index).
// Field names are PascalCase because they mirror the Go structs' exported fields.

export interface Doc {
  DocKey: string;
  AppCode: string;
  DocType: string;
  PkgNS: string;
  Section: string;
  Title: string;
  DocLabel: string;
  AppUser: string;
  DocUser: string;
}

export interface FacetValue {
  Value: string;
  Count: number;
}

export interface Meta {
  read_schema_version: string;
  capabilities: string[];
}

/** One table-of-contents entry (mirrors Go index.Section). */
export interface Section {
  ID: string;
  Title: string;
  Level: number;
}

/** Display vocabulary: abbreviation expansions + registry definitions, keyed by axis. Mirrors the
 *  Go index.Vocab struct; the facet pane reads these to explain each code on hover (no hardcoding). */
export interface Vocab {
  AppName: Record<string, string>;
  Namespace: Record<string, string>;
  DocType: Record<string, string>;
  Product: Record<string, string>;
  Persona: Record<string, string>;
  Section: Record<string, string>;
  Domain: Record<string, string>;
}

/** Selection state: axis → chosen values (AND across axes, OR within an axis). */
export type Selection = Record<string, string[]>;

function query(sel: Selection, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  for (const [axis, vals] of Object.entries(sel)) for (const v of vals) p.append(axis, v);
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function getJSON<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

export const api = {
  meta: () => getJSON<Meta>('/api/meta'),
  vocab: () => getJSON<Vocab>('/api/vocab'),
  facets: (axis: string, sel: Selection) =>
    getJSON<FacetValue[]>(`/api/facets${query(sel, { axis })}`),
  candidates: (sel: Selection, fts = '', scope = '') =>
    getJSON<Doc[]>(`/api/candidates${query(sel, { q: fts, scope })}`),
  toc: (docKey: string) => getJSON<Section[]>(`/api/doc/${encodeURIComponent(docKey)}/toc`),
  section: (id: string) => getJSON<{ text: string }>(`/api/section/${encodeURIComponent(id)}`),
  preview: (docKey: string) => getJSON<{ text: string }>(`/api/preview/${encodeURIComponent(docKey)}`),
  // An extracted-table CSV sidecar for a doc (raw text; null when absent — the reading pane then
  // leaves the link's caption in place rather than failing the whole render).
  table: async (docKey: string, name: string): Promise<string | null> => {
    const r = await fetch(`/api/table/${encodeURIComponent(docKey)}/${encodeURIComponent(name)}`);
    return r.ok ? r.text() : null;
  },
};
