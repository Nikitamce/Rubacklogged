const fs = require('fs');
const path = require('path');

const ruPath = path.join(__dirname, '../locales/ru.js');
let ru = fs.readFileSync(ruPath, 'utf-8');

const marker = "    // About, FAQ, Roadmap, Guidelines & Legal\n";
const additions = "    'Personalized page': 'Персональная страница',\n";

if (!ru.includes("'Personalized page':")) {
  ru = ru.replace(marker, marker + additions);
  fs.writeFileSync(ruPath, ru, 'utf-8');
  console.log("Added 'Personalized page'");
} else {
  console.log("Already exists");
}

