<script lang="ts">
  import { api, type Doc, type FacetValue, type Section, type Selection, type Vocab } from '$lib/api';
  import DOMPurify from 'dompurify';
  import { renderMarkdown, renderInline } from '$lib/markdown';
  import { parseCsv, csvToTableHtml } from '$lib/csvTable';

  // Facet order: the three primary axes (Domain · Audience · Type) lead, then the rest.
  const AXES: [string, string][] = [
    ['function_category', 'Domain'],
    ['doc_user', 'Audience'],
    ['doc_type', 'Type'],
    ['app_user', 'App user'],
    ['pkg_ns', 'Namespace'],
  ];

  // Which vocabulary map explains each axis (definition / expanded name), read from /api/vocab —
  // the registry, never hardcoded. app_user + doc_user are both personas.
  const AXIS_VOCAB: Record<string, keyof Vocab> = {
    section: 'Section',
    function_category: 'Domain',
    app_user: 'Persona',
    doc_type: 'DocType',
    doc_user: 'Persona',
    pkg_ns: 'Namespace',
  };
  // The Type (doc_type) facet is simplified from ~14 granular genres into a few families. Selecting
  // a family filters to all its member doc_types (OR within the axis). Front-end grouping: the codes
  // stay the data, the families are a presentation taxonomy (could move to a registry later).
  const TYPE_FAMILIES: [string, string[]][] = [
    ['Manuals & Guides', ['UM', 'UG', 'QRG', 'TRG', 'FAQ', 'TG']],
    ['Technical', ['TM', 'DG', 'API', 'INT', 'REF']],
    ['Admin & Security', ['SG', 'SM', 'AG']],
  ];
  const OTHER = 'Other';
  const FAMILY_OF: Record<string, string> = {};
  for (const [fam, types] of TYPE_FAMILIES) for (const t of types) FAMILY_OF[t] = fam;
  // doc_type facet values → family pseudo-values (summed counts), in family order then Other.
  function familyVals(vals: FacetValue[]): FacetValue[] {
    const sum = new Map<string, number>();
    for (const v of vals) {
      const fam = FAMILY_OF[v.Value] ?? OTHER;
      sum.set(fam, (sum.get(fam) ?? 0) + v.Count);
    }
    return [...TYPE_FAMILIES.map(([f]) => f), OTHER].flatMap((f) =>
      sum.has(f) ? [{ Value: f, Count: sum.get(f) as number }] : [],
    );
  }
  // The doc_type codes a family selects: its defined members; Other = present codes in no family.
  const familyMembers = (fam: string): string[] =>
    fam === OTHER
      ? (facets.doc_type ?? []).map((v) => v.Value).filter((v) => !FAMILY_OF[v])
      : (TYPE_FAMILIES.find(([f]) => f === fam)?.[1] ?? []);

  // Tooltip text for a facet value. For a Type family it's the member genres' full labels; otherwise
  // the registry definition/expansion (or '' for no hint).
  const define = (axis: string, value: string) => {
    if (axis === 'doc_type')
      return familyMembers(value)
        .map((t) => vocab?.DocType[t] || t)
        .join(', ');
    return (vocab && AXIS_VOCAB[axis] && vocab[AXIS_VOCAB[axis]][value]) || '';
  };

  // Full namespace (package) name for a result row's hover — e.g. DI → "FileMan" — from the same
  // /api/vocab Namespace map the facet uses. Falls back to the bare code when the producer has no
  // app_name for it (DG/BPS/USR/PSGW), so a row always shows *something* on hover.
  const nsLabel = (d: Doc) => {
    const ns = d.PkgNS || d.AppCode;
    return (vocab && vocab.Namespace[ns]) || ns || '';
  };

  // Floating hover tooltip. A custom element (not the native `title`, which webviews suppress and
  // which lags ~500ms): tracks the cursor, shows the registry definition instantly.
  let tip = $state<{ text: string; x: number; y: number } | null>(null);
  function hover(e: MouseEvent, text: string) {
    if (!text) return void (tip = null);
    tip = { text, x: e.clientX, y: e.clientY };
  }

  // Full-text search scope: which FTS columns the query box matches. 'all' (the default, every
  // indexed column incl. body) maps to no /api/candidates `scope` param; 'name'/'headings' restrict
  // to doc_title / (section heading + TOC path) via index.Filter.FTSScope.
  type Scope = 'all' | 'name' | 'headings';
  const SCOPES: [Scope, string, string][] = [
    ['all', 'All', 'Search document names, headings, and body text'],
    ['name', 'Name', 'Search document names only'],
    ['headings', 'Headings', 'Search section headings + table-of-contents entries'],
  ];
  let searchScope = $state<Scope>('all');

  let sel = $state<Selection>({});
  let collapsed = $state<Record<string, boolean>>({});
  // Per-section value sort: 'count' (backend default, most→least) → 'az' → 'za', cycled by the glyph.
  type SortMode = 'count' | 'az' | 'za';
  let sortBy = $state<Record<string, SortMode>>({});
  const SORT_NEXT: Record<SortMode, SortMode> = { count: 'az', az: 'za', za: 'count' };
  const SORT_GLYPH: Record<SortMode, string> = { count: '#↓', az: 'A↓', za: 'Z↓' };
  const SORT_HINT: Record<SortMode, string> = {
    count: 'Sorted by count — click to sort A–Z',
    az: 'Sorted A–Z — click to sort Z–A',
    za: 'Sorted Z–A — click to sort by count',
  };
  // The whole left pane collapses to the left like a VSCode side panel, leaving the filter rail.
  let railOpen = $state(true);
  // Within the left pane, 'Select' (criteria) and 'Results' (doc list) are independently collapsible
  // sections; with both open, a draggable divider sets the split (splitPct = the Select share).
  let selOpen = $state(true);
  let resOpen = $state(true);
  let splitPct = $state(50);
  let asideEl: HTMLElement | undefined = $state(undefined);
  let dragging = $state(false);
  // Flex for a section: collapsed → just its header; only one open → fills; both open → share by pct.
  function paneFlex(meOpen: boolean, otherOpen: boolean, myPct: number): string {
    if (!meOpen) return 'flex: 0 0 auto';
    if (!otherOpen) return 'flex: 1 1 0';
    return `flex: ${myPct} 1 0`;
  }
  function startDrag(e: PointerEvent) {
    dragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onDrag(e: PointerEvent) {
    if (!dragging || !asideEl) return;
    const r = asideEl.getBoundingClientRect();
    splitPct = Math.min(85, Math.max(15, ((e.clientY - r.top) / r.height) * 100));
  }
  function endDrag(e: PointerEvent) {
    dragging = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }
  let fts = $state('');
  let facets = $state<Record<string, FacetValue[]>>({});
  let docs = $state<Doc[]>([]);
  let vocab = $state<Vocab | null>(null);
  let error = $state('');

  // Preview pane: the opened document, its TOC, and the body being shown (a section, or the
  // whole-document preview). heading is what the pane titles itself with.
  let open = $state<Doc | null>(null);
  let toc = $state<Section[]>([]);
  let body = $state('');
  let heading = $state('');
  // body is gold markdown; render to HTML and sanitize before {@html} (defense in depth —
  // the corpus is curated, but {@html} on untrusted markup is an XSS vector).
  const bodyHtml = $derived(body ? DOMPurify.sanitize(renderMarkdown(body)) : '');

  // Hydrate the extracted-table placeholders renderMarkdown leaves (the `[Table N (extracted to
  // CSV)]` sidecars): once the body is in the DOM, fetch each doc's CSV and render it inline as a
  // table where its link sat. A missing CSV (404) leaves the caption untouched — never blocks the
  // body. Re-runs when the rendered body or the open doc changes; a `data-loaded` flag de-dupes.
  let bodyEl = $state<HTMLElement | undefined>();
  $effect(() => {
    void bodyHtml; // re-run after each (re)render of the body
    const el = bodyEl;
    const docKey = open?.DocKey;
    if (!el || !docKey) return;
    for (const ph of el.querySelectorAll<HTMLElement>('.csv-table[data-csv]:not([data-loaded])')) {
      ph.dataset.loaded = '1';
      const name = ph.dataset.csv ?? '';
      const caption = ph.innerHTML;
      api
        .table(docKey, name)
        .then((csv) => {
          if (csv == null) return; // graceful: keep the caption, no table
          const table = csvToTableHtml(parseCsv(csv), (c) => renderInline(c));
          ph.innerHTML = DOMPurify.sanitize(`<figcaption>${caption}</figcaption>${table}`);
          ph.classList.add('csv-loaded');
        })
        .catch(() => {});
    }
  });

  // Collapsible TOC. The flat list carries a Level per entry; a node "has children" when the next
  // entry is deeper. tocCollapsed holds the IDs whose subtree is hidden; tocRows walks the flat list
  // and drops any entry sitting under a collapsed ancestor (deeper than the collapsed node's level).
  let tocCollapsed = $state<Set<string>>(new Set());
  function toggleTocNode(id: string) {
    const next = new Set(tocCollapsed);
    next.has(id) ? next.delete(id) : next.add(id);
    tocCollapsed = next;
  }
  const tocRows = $derived.by(() => {
    const rows: { s: Section; hasChildren: boolean; collapsed: boolean }[] = [];
    let hiddenBelow = Infinity; // hide entries deeper than this (a collapsed ancestor's level)
    for (let i = 0; i < toc.length; i++) {
      const s = toc[i];
      if (s.Level > hiddenBelow) continue; // inside a collapsed subtree → skip
      hiddenBelow = Infinity; // reached a visible level again
      const hasChildren = i + 1 < toc.length && toc[i + 1].Level > s.Level;
      const collapsed = tocCollapsed.has(s.ID);
      rows.push({ s, hasChildren, collapsed });
      if (hasChildren && collapsed) hiddenBelow = s.Level;
    }
    return rows;
  });
  const tocAllCollapsed = $derived(
    tocRows.length > 0 && tocRows.every((r) => !r.hasChildren || r.collapsed),
  );
  function collapseToc(all: boolean) {
    tocCollapsed = all
      ? new Set(toc.filter((_, i) => i + 1 < toc.length && toc[i + 1].Level > toc[i].Level).map((s) => s.ID))
      : new Set();
  }

  function openDoc(d: Doc) {
    open = d;
    toc = [];
    tocCollapsed = new Set();
    heading = d.Title || d.DocKey;
    body = '';
    error = '';
    api.toc(d.DocKey).then((t) => (toc = t ?? [])).catch((e) => (error = String(e)));
    api.preview(d.DocKey).then((p) => (body = p.text)).catch((e) => (error = String(e)));
  }
  function openSection(s: Section) {
    heading = s.Title;
    body = '';
    api.section(s.ID).then((p) => (body = p.text)).catch((e) => (error = String(e)));
  }
  function showFull() {
    if (open) openDoc(open);
  }
  function closePane() {
    open = null;
    toc = [];
    body = '';
  }

  function toggle(axis: string, value: string) {
    // doc_type is shown as families — `value` is a family label; toggle all its member codes at once.
    const values = axis === 'doc_type' ? familyMembers(value) : [value];
    const cur = new Set(sel[axis] ?? []);
    const on = values.some((v) => cur.has(v));
    for (const v of values) on ? cur.delete(v) : cur.add(v);
    const next = { ...sel };
    if (cur.size) next[axis] = [...cur];
    else delete next[axis];
    sel = next;
  }
  const isOn = (axis: string, value: string) =>
    axis === 'doc_type'
      ? familyMembers(value).some((m) => (sel.doc_type ?? []).includes(m))
      : (sel[axis] ?? []).includes(value);
  function toggleAxis(axis: string) {
    collapsed = { ...collapsed, [axis]: !collapsed[axis] };
  }
  // One expand/collapse-all toggle for the facet axes (mirrors the TOC's). "All collapsed" is judged
  // over the axes actually shown (those with values), so the label reflects the next action.
  const presentAxes = $derived(AXES.filter(([ax]) => (facets[ax] ?? []).length > 0));
  const allAxesCollapsed = $derived(
    presentAxes.length > 0 && presentAxes.every(([ax]) => collapsed[ax]),
  );
  function toggleAllAxes() {
    collapsed = allAxesCollapsed ? {} : Object.fromEntries(presentAxes.map(([ax]) => [ax, true]));
  }
  // Cycle a section's value sort: by count → A–Z → Z–A → by count.
  function cycleSort(axis: string) {
    sortBy = { ...sortBy, [axis]: SORT_NEXT[sortBy[axis] ?? 'count'] };
  }
  function axisVals(axis: string, vals: FacetValue[]): FacetValue[] {
    const base = axis === 'doc_type' ? familyVals(vals) : vals; // Type shows families, not raw codes
    const mode = sortBy[axis] ?? 'count';
    if (mode === 'count') return base; // backend already orders by count desc, then value
    const sorted = [...base].sort((a, b) => (a.Value || '').localeCompare(b.Value || ''));
    return mode === 'za' ? sorted.reverse() : sorted;
  }
  // Active selections on an axis. For doc_type, count distinct *families* among the selected codes.
  const selCount = (axis: string) =>
    axis === 'doc_type'
      ? new Set((sel.doc_type ?? []).map((t) => FAMILY_OF[t] ?? OTHER)).size
      : (sel[axis] ?? []).length;
  // Total active facet selections — surfaced as a dot on the filter icon when the panel is hidden.
  const activeFilters = $derived(Object.values(sel).reduce((n, vs) => n + vs.length, 0));
  // Layout: filter rail (always) | left panel (filter criteria on top, result names below) when
  // open | the reading area (TOC + document body, or an empty hint).
  const gridCols = $derived(`2.5rem${railOpen ? ' 15rem' : ''} minmax(0, 1fr)`);
  function clear() {
    sel = {};
    fts = '';
    closePane();
  }

  // Re-query facets + candidates whenever the selection, full-text query, or search scope changes.
  $effect(() => {
    const snapshot = sel;
    const q = fts;
    const scope = searchScope === 'all' ? '' : searchScope;
    error = '';
    Promise.all(AXES.map(([ax]) => api.facets(ax, snapshot).then((v) => [ax, v] as const)))
      .then((pairs) => (facets = Object.fromEntries(pairs)))
      .catch((e) => (error = String(e)));
    api
      .candidates(snapshot, q, scope)
      .then((d) => (docs = d ?? []))
      .catch((e) => (error = String(e)));
  });

  api.vocab().then((v) => (vocab = v)).catch(() => {});
</script>

<header>
  <h1>vdocs</h1>
  <input class="fts" placeholder="full-text search…" bind:value={fts} />
  <div class="scope" role="group" aria-label="Search scope">
    {#each SCOPES as [val, label, hint] (val)}
      <button
        class="scopebtn"
        class:on={searchScope === val}
        aria-pressed={searchScope === val}
        onmousemove={(e) => hover(e, hint)}
        onmouseleave={() => (tip = null)}
        onclick={() => (searchScope = val)}
      >{label}</button>
    {/each}
  </div>
  <span class="dim">{docs.length} documents</span>
</header>

{#if error}<p class="err">{error}</p>{/if}

<main style="grid-template-columns: {gridCols}">
  <nav class="rail">
    <button
      class="railbtn"
      class:on={railOpen}
      aria-pressed={railOpen}
      title={railOpen ? 'Hide filters' : 'Show filters'}
      onclick={() => (railOpen = !railOpen)}
    >
      <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true">
        <path d="M1.5 2h13a.5.5 0 0 1 .4.8L10 9.2V14a.5.5 0 0 1-.72.45l-2.5-1.25A.5.5 0 0 1 6.5 12.75V9.2L1.1 2.8A.5.5 0 0 1 1.5 2z" />
      </svg>
      {#if !railOpen && activeFilters}<span class="dot">{activeFilters}</span>{/if}
    </button>
  </nav>
  {#if railOpen}
  <aside bind:this={asideEl} class:dragging>
    <div class="pane" style={paneFlex(selOpen, resOpen, splitPct)}>
      <button class="panehead" aria-expanded={selOpen} onclick={() => (selOpen = !selOpen)}>
        <span class="chev">{selOpen ? '▾' : '▸'}</span>
        <span class="ptitle2">Select</span>
        {#if activeFilters}<span class="badge">{activeFilters}</span>{/if}
      </button>
      {#if selOpen}
      <div class="panebody filtersbody">
      <div class="axtools">
        <button
          class="lnk"
          title={allAxesCollapsed ? 'Expand every section' : 'Collapse every section'}
          onclick={toggleAllAxes}
        >{allAxesCollapsed ? '▾ expand all' : '▸ collapse all'}</button>
        <button class="lnk clear" title="Clear all selections and search" onclick={clear}>✕ clear</button>
      </div>
      {#each AXES as [axis, label] (axis)}
        {@const vals = facets[axis] ?? []}
        {#if vals.length}
          <section class="axis">
            <h2 class="axrow">
              <button class="axhead" aria-expanded={!collapsed[axis]} onclick={() => toggleAxis(axis)}>
                <span class="chev">{collapsed[axis] ? '▸' : '▾'}</span>
                <span class="axlabel">{label}</span>
                {#if collapsed[axis] && selCount(axis)}<span class="badge">{selCount(axis)}</span>{/if}
              </button>
              <button
                class="sortgly"
                class:on={(sortBy[axis] ?? 'count') !== 'count'}
                aria-label="sort {label}"
                onmousemove={(e) => hover(e, SORT_HINT[sortBy[axis] ?? 'count'])}
                onmouseleave={() => (tip = null)}
                onclick={() => cycleSort(axis)}
              >{SORT_GLYPH[sortBy[axis] ?? 'count']}</button>
            </h2>
            {#if !collapsed[axis]}
              {#each axisVals(axis, vals) as v (v.Value)}
                <button
                  class="val"
                  class:sel={isOn(axis, v.Value)}
                  onmousemove={(e) => hover(e, define(axis, v.Value))}
                  onmouseleave={() => (tip = null)}
                  onclick={() => toggle(axis, v.Value)}
                >
                  <span>{v.Value || '(none)'}</span><span class="c">{v.Count}</span>
                </button>
              {/each}
            {/if}
          </section>
        {/if}
      {/each}
      </div>
      {/if}
    </div>

    {#if selOpen && resOpen}
      <div
        class="divider"
        class:dragging
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize sections"
        onpointerdown={startDrag}
        onpointermove={onDrag}
        onpointerup={endDrag}
      ></div>
    {/if}

    <div class="pane" style={paneFlex(resOpen, selOpen, 100 - splitPct)}>
      <button class="panehead" aria-expanded={resOpen} onclick={() => (resOpen = !resOpen)}>
        <span class="chev">{resOpen ? '▾' : '▸'}</span>
        <span class="ptitle2">Results</span>
        <span class="hcount">{docs.length}</span>
      </button>
      {#if resOpen}
        <div class="panebody reslist">
          {#each docs.slice(0, 500) as d (d.DocKey)}
            <button
              class="doc"
              class:open={open?.DocKey === d.DocKey}
              onmousemove={(e) => hover(e, nsLabel(d))}
              onmouseleave={() => (tip = null)}
              onclick={() => openDoc(d)}
            >{d.Title || d.DocKey}</button>
          {/each}
        </div>
      {/if}
    </div>
  </aside>
  {/if}

  <section class="preview">
    {#if open}
      <div class="phead">
        <div class="ptitle">{heading}</div>
        <div class="pacts">
          {#if heading !== (open.Title || open.DocKey)}
            <button onclick={showFull}>full document</button>
          {/if}
          <button onclick={closePane}>close</button>
        </div>
      </div>
      <div class="pbody">
        {#if toc.length}
          <nav class="toc">
            {#if toc.some((s, i) => i + 1 < toc.length && toc[i + 1].Level > s.Level)}
              <div class="toctools">
                <button class="lnk" onclick={() => collapseToc(!tocAllCollapsed)}>
                  {tocAllCollapsed ? '▾ expand all' : '▸ collapse all'}
                </button>
              </div>
            {/if}
            {#each tocRows as row (row.s.ID)}
              <div class="tocrow" style="padding-left: {0.15 + (row.s.Level - 1) * 0.85}rem">
                {#if row.hasChildren}
                  <button
                    class="toctog"
                    aria-label={row.collapsed ? 'Expand section' : 'Collapse section'}
                    aria-expanded={!row.collapsed}
                    onclick={() => toggleTocNode(row.s.ID)}
                  >{row.collapsed ? '▸' : '▾'}</button>
                {:else}
                  <span class="toctog spacer"></span>
                {/if}
                <button class="toctitle" onclick={() => openSection(row.s)}>{row.s.Title}</button>
              </div>
            {/each}
          </nav>
        {/if}
        <article class="ptext markdown" bind:this={bodyEl}>
          {#if body}{@html bodyHtml}{:else}(no text){/if}
        </article>
      </div>
    {:else}
      <div class="empty">Select a document from the list to read it here.</div>
    {/if}
  </section>
</main>

{#if tip}
  <div class="tip" style="left: {tip.x + 14}px; top: {tip.y + 16}px">{tip.text}</div>
{/if}

<style>
  /* Light theme. Semantic tokens — flip these (and they'd cascade) for a dark variant later. */
  :global(:root) {
    --bg: #ffffff;
    --panel: #f3f5f7;
    --panel-hover: #e8ecf1;
    --surface: #ffffff;
    --border: #d7dce2;
    --border-soft: #e7eaee;
    --border-strong: #c0c7d0;
    --text: #1f2328;
    --text-2: #424a54;
    --muted: #6b7280;
    --accent: #1d4ed8;
    --accent-bg: #e6eefc;
    --sel-bg: #dbe7fb;
    --err: #c5341b;
  }
  :global(body) {
    margin: 0;
    font: 14px/1.5 system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
  }
  header {
    display: flex;
    gap: 1rem;
    align-items: baseline;
    padding: 0.6rem 1rem;
    border-bottom: 1px solid var(--border);
  }
  h1 {
    font-size: 1rem;
    margin: 0;
  }
  .fts {
    flex: 1;
    max-width: 22rem;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    color: inherit;
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
  }
  .dim {
    color: var(--muted);
  }
  /* Segmented search-scope control (All · Name · Headings). */
  .scope {
    display: inline-flex;
    align-self: center;
    border: 1px solid var(--border-strong);
    border-radius: 4px;
    overflow: hidden;
  }
  .scopebtn {
    border: 0;
    border-left: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text-2);
    font: inherit;
    font-size: 0.72rem;
    cursor: pointer;
    padding: 0.2rem 0.55rem;
  }
  .scopebtn:first-child {
    border-left: 0;
  }
  .scopebtn:hover {
    background: var(--panel-hover);
    color: var(--text);
  }
  .scopebtn.on {
    background: var(--accent-bg);
    color: var(--accent);
    font-weight: 600;
  }
  .err {
    color: var(--err);
    padding: 0.5rem 1rem;
  }
  main {
    display: grid;
    height: calc(100vh - 49px);
    /* Pin the single row to the viewport (minmax(0,…), not auto) so a long document body scrolls
       inside the reading pane instead of stretching every column — otherwise the 50/50 left pane
       grows with it and the document list is pushed off-screen. */
    grid-template-rows: minmax(0, 1fr);
    overflow: hidden;
    transition: grid-template-columns 0.15s ease;
  }
  /* Always-present filter rail (VSCode activity-bar style) — the panel collapses behind it. */
  .rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    padding-top: 0.4rem;
    border-right: 1px solid var(--border);
    background: var(--panel);
  }
  .railbtn {
    position: relative;
    display: flex;
    border: 0;
    background: none;
    color: var(--muted);
    cursor: pointer;
    padding: 0.35rem;
    border-radius: 6px;
  }
  .railbtn:hover {
    background: var(--panel-hover);
    color: var(--text);
  }
  .railbtn.on {
    color: var(--accent);
    background: var(--accent-bg);
  }
  .dot {
    position: absolute;
    top: -0.1rem;
    right: -0.1rem;
    min-width: 0.95rem;
    height: 0.95rem;
    padding: 0 0.2rem;
    box-sizing: border-box;
    background: var(--accent);
    color: #fff;
    border-radius: 999px;
    font-size: 0.62rem;
    line-height: 0.95rem;
    text-align: center;
    font-weight: 700;
  }
  aside {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-right: 1px solid var(--border);
    min-width: 0;
    min-height: 0;
  }
  aside.dragging {
    user-select: none;
    cursor: row-resize;
  }
  /* A collapsible section (Select / Results): header always shown, body fills the section's share. */
  .pane {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }
  .panehead {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    border: 0;
    border-bottom: 1px solid var(--border-soft);
    background: var(--panel);
    color: var(--text-2);
    font: inherit;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    cursor: pointer;
    padding: 0.32rem 0.45rem;
  }
  .panehead:hover {
    background: var(--panel-hover);
    color: var(--text);
  }
  .ptitle2 {
    flex: 1;
    font-weight: 600;
  }
  .hcount {
    color: var(--muted);
  }
  .panebody {
    flex: 1 1 0;
    overflow: auto;
    min-height: 0;
  }
  .filtersbody {
    padding: 0.5rem;
  }
  .reslist {
    padding-bottom: 0.25rem;
  }
  /* Draggable divider between the two open sections. */
  .divider {
    flex: 0 0 7px;
    cursor: row-resize;
    background: var(--panel);
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    touch-action: none;
  }
  .divider:hover,
  .divider.dragging {
    background: var(--border-strong);
  }
  .axtools {
    display: flex;
    gap: 0.6rem;
    padding: 0.15rem 0.25rem 0.4rem;
    border-bottom: 1px solid var(--border-soft);
    margin-bottom: 0.5rem;
  }
  .lnk {
    border: 0;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 0.7rem;
    cursor: pointer;
    padding: 0.1rem 0.2rem;
    border-radius: 3px;
  }
  .lnk:hover {
    background: var(--panel-hover);
    color: var(--text-2);
  }
  .clear {
    margin-left: auto;
    color: var(--accent);
  }
  .axis {
    margin-bottom: 0.8rem;
  }
  .axis h2 {
    margin: 0.2rem 0;
  }
  .axrow {
    display: flex;
    align-items: center;
    gap: 0.2rem;
  }
  .axhead {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex: 1;
    min-width: 0;
    border: 0;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    text-align: left;
    cursor: pointer;
    padding: 0.12rem 0.25rem;
    border-radius: 3px;
  }
  .axhead:hover {
    background: var(--panel-hover);
    color: var(--text-2);
  }
  .sortgly {
    flex-shrink: 0;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text-2);
    font: inherit;
    font-size: 0.66rem;
    letter-spacing: 0.03em;
    cursor: pointer;
    padding: 0.05rem 0.32rem;
    border-radius: 4px;
  }
  .sortgly:hover {
    background: var(--panel-hover);
    color: var(--text);
    border-color: var(--muted);
  }
  .sortgly.on {
    color: var(--accent);
    border-color: var(--accent);
    background: var(--accent-bg);
  }
  .chev {
    width: 0.7rem;
    flex-shrink: 0;
  }
  .axlabel {
    flex: 1;
  }
  .badge {
    background: var(--accent-bg);
    color: var(--accent);
    border-radius: 999px;
    padding: 0 0.4rem;
    font-size: 0.68rem;
  }
  .val {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 0.78rem; /* clearly smaller than the 14px body, like the result list */
    text-align: left;
    cursor: pointer;
    padding: 0.1rem 0.35rem 0.1rem 1.05rem; /* indented under the facet header */
    border-radius: 3px;
  }
  .val:hover {
    background: var(--panel-hover);
  }
  .val.sel {
    color: var(--accent);
    font-weight: 600;
  }
  .val .c {
    color: var(--muted);
  }
  .doc {
    display: block;
    width: 100%;
    border: 0;
    background: none;
    color: var(--text-2);
    font: inherit;
    font-size: 0.78rem;
    line-height: 1.45;
    text-align: left;
    cursor: pointer;
    padding: 0 0.4rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .doc:hover {
    background: var(--panel-hover);
    color: var(--text);
  }
  .doc.open {
    background: var(--sel-bg);
    color: var(--accent);
    font-weight: 600;
  }
  .empty {
    margin: auto;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .preview {
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--border);
    min-width: 0;
    min-height: 0;
  }
  .phead {
    display: flex;
    gap: 1rem;
    align-items: baseline;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--border);
  }
  .ptitle {
    font-weight: 600;
  }
  .pacts {
    display: flex;
    gap: 0.4rem;
    flex-shrink: 0;
  }
  .pbody {
    display: grid;
    grid-template-columns: minmax(0, 14rem) 1fr;
    overflow: hidden;
    flex: 1;
  }
  .toc {
    overflow: auto;
    padding: 0.5rem;
    border-right: 1px solid var(--border-soft);
  }
  .toctools {
    display: flex;
    padding: 0 0.1rem 0.35rem;
    margin-bottom: 0.25rem;
    border-bottom: 1px solid var(--border-soft);
  }
  .tocrow {
    display: flex;
    align-items: flex-start;
    gap: 0.1rem;
    border-radius: 3px;
  }
  /* Chevron toggle for a parent node; the spacer keeps leaf titles aligned with parents'. */
  .toctog {
    flex: 0 0 1rem;
    width: 1rem;
    border: 0;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 0.7rem;
    line-height: 1.6;
    cursor: pointer;
    padding: 0.1rem 0;
    text-align: center;
  }
  .toctog.spacer {
    cursor: default;
  }
  .toctog:not(.spacer):hover {
    color: var(--text);
  }
  .toctitle {
    flex: 1;
    min-width: 0;
    border: 0;
    background: none;
    color: var(--text-2);
    font: inherit;
    text-align: left;
    cursor: pointer;
    padding: 0.15rem 0.25rem;
    border-radius: 3px;
  }
  .toctitle:hover {
    background: var(--panel-hover);
    color: var(--text);
  }
  .ptext {
    overflow: auto;
    padding: 0.75rem 1.25rem;
    color: var(--text);
    line-height: 1.5;
  }
  /* {@html}-rendered markdown is NOT scoped by Svelte — style descendants via :global. */
  .markdown :global(h1),
  .markdown :global(h2),
  .markdown :global(h3),
  .markdown :global(h4) {
    line-height: 1.25;
    margin: 1.1em 0 0.5em;
  }
  .markdown :global(h1) {
    font-size: 1.5rem;
  }
  .markdown :global(h2) {
    font-size: 1.25rem;
  }
  .markdown :global(h3) {
    font-size: 1.1rem;
  }
  .markdown :global(p) {
    margin: 0.5em 0;
  }
  .markdown :global(ul),
  .markdown :global(ol) {
    margin: 0.5em 0;
    padding-left: 1.5rem;
  }
  .markdown :global(a) {
    color: var(--link, #0b6bcb);
  }
  .markdown :global(code) {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.9em;
    background: var(--panel);
    padding: 0.1em 0.3em;
    border-radius: 3px;
  }
  .markdown :global(pre) {
    background: var(--panel);
    padding: 0.75rem 1rem;
    border-radius: 6px;
    overflow-x: auto;
  }
  .markdown :global(pre code) {
    background: none;
    padding: 0;
  }
  /* Tables — the original reason this pane needed rendering. */
  .markdown :global(table) {
    border-collapse: collapse;
    margin: 0.75em 0;
    font-size: 0.95em;
  }
  .markdown :global(th),
  .markdown :global(td) {
    border: 1px solid var(--border);
    padding: 0.35em 0.6em;
    text-align: left;
    vertical-align: top;
  }
  .markdown :global(th) {
    background: var(--panel);
    font-weight: 600;
  }
  /* Extracted-table sidecar (hydrated from /api/table). A wide data-dictionary table scrolls
     horizontally WITHIN the block, so the page itself never scrolls sideways; the caption sits
     above. Before hydration (or if the CSV is absent) the bare caption shows, muted. */
  .markdown :global(.csv-table) {
    margin: 1em 0;
    overflow-x: auto;
  }
  .markdown :global(.csv-table figcaption) {
    margin-bottom: 0.35em;
    font-size: 0.9em;
    color: var(--muted, #5a6473);
  }
  .markdown :global(.csv-table:not(.csv-loaded)) {
    font-style: italic;
    color: var(--muted, #5a6473);
  }
  .markdown :global(blockquote) {
    margin: 0.5em 0;
    padding-left: 0.9rem;
    border-left: 3px solid var(--border);
    color: var(--muted, #5a6473);
  }
  /* Figures: standardized centered placement with a centered caption underneath. The <figure>
     shrink-wraps its image (fit-content) and is capped at 600px AND the pane width (min(100%,600px)),
     so the whole figure is always visible without horizontal scrolling; margin auto centers it.
     The caption (gold alt text / title) sits centered below. */
  .markdown :global(figure) {
    width: fit-content;
    max-width: min(100%, 600px);
    margin: 1em auto;
  }
  .markdown :global(figure img) {
    display: block;
    max-width: 100%;
    height: auto;
    margin: 0 auto;
  }
  .markdown :global(figcaption) {
    margin-top: 0.45em;
    font-size: 0.9em;
    line-height: 1.35;
    text-align: center;
    color: var(--muted, #5a6473);
  }
  /* Floating facet definition; fixed so the sidebar's overflow:auto can't clip it. */
  .tip {
    position: fixed;
    z-index: 50;
    max-width: 22rem;
    background: #1f2328;
    color: #f3f5f7;
    border: 1px solid #3a4150;
    border-radius: 5px;
    padding: 0.35rem 0.55rem;
    font-size: 0.82rem;
    line-height: 1.45;
    box-shadow: 0 4px 14px rgba(31, 35, 40, 0.22);
    pointer-events: none;
  }
</style>
