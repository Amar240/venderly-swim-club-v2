import { SHARED_STYLES } from "./styles";

export const escapeHtml = (value: string): string =>
  String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    };

    return entities[char] ?? char;
  });

export const renderLayout = (opts: {
  title: string;
  body: string;
  autoRedirectSeconds?: number;
  redirectUrl?: string;
}): string => {
  const redirectMeta =
    opts.autoRedirectSeconds && opts.redirectUrl
      ? `<meta http-equiv="refresh" content="${opts.autoRedirectSeconds}; url=${escapeHtml(opts.redirectUrl)}">`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <meta name="theme-color" content="#2196F3">
  <title>${escapeHtml(opts.title)} · Wedgewood Swim Club</title>
  ${redirectMeta}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>${SHARED_STYLES}</style>
</head>
<body>
  <div class="page">
    <header class="header">
      <img src="https://assets.cdn.filesafe.space/Bjt6c984XN3YKY5porzI/media/6980bb3566e7ca30baf9488c.png"
           alt="Wedgewood Swim Club" class="logo">
    </header>
    <main class="main">
      ${opts.body}
    </main>
    <footer class="footer">
      <p>Wedgewood Swim Club · 2A Wedgefield Drive, New Castle, DE</p>
      <p class="footer-meta">Powered by Venderly</p>
    </footer>
  </div>
</body>
</html>`;
};
