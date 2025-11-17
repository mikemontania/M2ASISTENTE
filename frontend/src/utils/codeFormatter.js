// Basic detection of fenced code blocks and language
export const detectCodeBlocks = (text = '') => {
  const regex = /```(\w+)?\n([\s\S]*?)```/g;
  const blocks = [];
  let m;
  while ((m = regex.exec(text)) !== null) {
    blocks.push({ lang: m[1] || 'text', code: m[2] });
  }
  return blocks;
};