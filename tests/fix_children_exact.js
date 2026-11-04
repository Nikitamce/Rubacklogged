const fs = require('fs');
const path = require('path');

const ruPath = path.join(__dirname, '../locales/ru.js');
let ru = fs.readFileSync(ruPath, 'utf-8');

// The exact string from the website: "If you become aware..."
const exactWebsiteKey = 'We do not address anyone under the age of 13 ("Children"). We do not knowingly collect personally identifiable information from children under 13. If you are a parent or guardian and you are aware that your Children has provided us with personal data, please contact us. If you become aware that we have collected personal data from children under 13 without parental consent, we will take the necessary steps to remove that information from our servers.';
const translation = 'Наш Сайт не предназначен для лиц младше 13 лет. Мы намеренно не собираем персональные данные детей до 13 лет. Если вы родитель и вам стало известно, что ваш ребёнок передал нам личные данные, свяжитесь с нами, и мы удалим эту информацию с серверов.';

const escapedKey = exactWebsiteKey.replace(/'/g, "\\'");
const escapedVal = translation.replace(/'/g, "\\'");

const marker = "  const strings = {\n";
ru = ru.replace(marker, marker + `    '${escapedKey}': '${escapedVal}',\n`);

fs.writeFileSync(ruPath, ru, 'utf-8');
console.log("Replaced with exact 'If you become aware' key.");

