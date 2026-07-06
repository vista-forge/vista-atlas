/**
 * The webview document: a full-bleed iframe pointing at the running
 * in-process navigator server (the predecessor extension's pattern —
 * code reference authorized by owner, 2026-07-05). The frame URL is
 * the result of `vscode.env.asExternalUri(http://127.0.0.1:<port>)`,
 * which combined with the panel's portMapping makes the loopback
 * origin reachable locally and over Remote-SSH. Pure string builder
 * (no vscode) so the CSP/escaping is unit-tested.
 */

function origin(uri: string): string {
  try {
    return new URL(uri).origin;
  } catch {
    return uri;
  }
}

function escapeAttr(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/** Build the iframe-host HTML that frames the live navigator at frameUri. */
export function panelHtml(frameUri: string): string {
  const frameOrigin = origin(frameUri);
  // The mapped origin may be localhost (local) or a vscode-cdn/devtunnel
  // host (remote); allow the exact origin plus the loopback wildcards
  // portMapping rewrites to.
  const frameSrc = `${frameOrigin} http://localhost:* http://127.0.0.1:* https:`;
  const safeUri = escapeAttr(frameUri);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; frame-src ${frameSrc}; style-src 'unsafe-inline';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>VistA Atlas</title>
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
    iframe { width: 100%; height: 100%; border: 0; display: block; }
  </style>
</head>
<body>
  <iframe src="${safeUri}" title="VistA Atlas" allow="clipboard-read; clipboard-write"></iframe>
</body>
</html>`;
}
