import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Solo lo que pinta la app del concursante (QTextBrowser de Qt): sin imágenes ni HTML libre.
const ALLOWED_TAGS = [
  'p', 'strong', 'em', 'del', 'code', 'pre', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote', 'a', 'br', 'hr',
];

// Markdown -> HTML saneado, listo para [innerHTML] (pásalo por DomSanitizer.bypassSecurityTrustHtml).
export function renderMarkdown(md: string | null | undefined): string {
  if (!md) return '';
  const html = marked.parse(md, { async: false }) as string;
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR: ['href', 'align'] });
}
