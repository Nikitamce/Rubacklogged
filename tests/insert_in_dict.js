const fs = require('fs');
const path = require('path');

const ruPath = path.join(__dirname, '../locales/ru.js');
let ru = fs.readFileSync(ruPath, 'utf-8');

const marker = "const dictionary = {\n";
const additions = [
  "    'Manage Consent': 'Управление согласием',\n",
  "    'Awards': 'Награды',\n",
  "    'Personalized page': 'Персональная страница',\n"
].join('');

ru = ru.replace(marker, marker + additions);
fs.writeFileSync(ruPath, ru, 'utf-8');
console.log("Inserted inside dictionary!");

