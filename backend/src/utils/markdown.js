const marked = require('marked');

// Convert markdown to HTML (frontend can handle rendering)
const markdownToHtml = (md) => {
  return marked.parse(md || '');
};

module.exports = { markdownToHtml };