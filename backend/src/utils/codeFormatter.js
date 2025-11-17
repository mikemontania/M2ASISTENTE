// Simple detection of fenced code blocks and metadata for frontend rendering
const detectCodeBlocks = (text) => {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const blocks = [];
  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    blocks.push({
      lang: match[1] || null,
      code: match[2]
    });
  }
  return blocks;
};

module.exports = { detectCodeBlocks };