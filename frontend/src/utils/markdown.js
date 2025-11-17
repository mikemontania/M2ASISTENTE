import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight: (str, lang) => {
    try {
      if (lang && hljs.getLanguage(lang)) {
        return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang }).value}</code></pre>`;
      }
    } catch (e) {}
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`;
  }
});

export const renderMarkdown = (text) => md.render(text || '');