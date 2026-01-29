const fs = require('fs');

const content = fs.readFileSync('temp_docx/word/document.xml', 'utf8');
// Regex for phone numbers (approx 10-13 digits, maybe with spaces/hyphens initially, but here likely raw text in xml tags)
// XML cleans out, so we look for digits.
// Let's assume they are just listed.
const numbers = content.match(/\d{10,13}/g);

if (numbers) {
    const unique = [...new Set(numbers)];
    console.log(JSON.stringify(unique));
} else {
    console.log('No numbers found');
}
