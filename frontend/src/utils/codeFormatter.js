// Basic detection of fenced code blocks and language
export const detectCodeBlocks = (text = '') => {
  const fence = String.fromCharCode(96).repeat(3); // genera ```
  const regex = new RegExp(
    fence + '(\\w+)?\\n([\\s\\S]*?)' + fence,
    'g'
  );

  const blocks = [];
  let m;

  while ((m = regex.exec(text)) !== null) {
    blocks.push({ lang: m[1] || 'text', code: m[2] });
  }

  return blocks;
};
