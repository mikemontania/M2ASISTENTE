const fs = require('fs');
const pdf = require('pdf-parse');

const extractTextFromPdf = async (filePath) => {
  const dataBuffer = fs.readFileSync(filePath);
  const result = await pdf(dataBuffer);
  // result.text contains the extracted text
  return result.text || '';
};

module.exports = { extractTextFromPdf };