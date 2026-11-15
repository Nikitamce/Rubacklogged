/* GameQuill — извлечено из sit3020.txt и адаптировано для PANAX RU (iframe-страница расширения).
   Патчи: реальный поиск Steam вместо мок-базы, без авто-демо, локальные шрифты, экранирование
   данных из сети, валидация импорта, мост к странице поста (см. блок PANAX в конце). */
'use strict';
/* ==========================================================================
   GameQuill — редактор обзоров видеоигр
   ========================================================================== */
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const uid=()=>Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-3);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const debounce=(fn,ms=450)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms)}};
const clone=o=>JSON.parse(JSON.stringify(o));

/* ---------- генерация обложек (SVG, без внешних ресурсов) ---------- */
function wrapTitle(t,max=13){const w=t.split(' ');const L=[];let c='';w.forEach(x=>{if((c+' '+x).trim().length>max&&c){L.push(c.trim());c=x}else c=(c+' '+x).trim()});if(c)L.push(c);return L.slice(0,3)}
function coverArt(seed,title,pal){
  let s=0;for(const ch of seed)s=(s*131+ch.charCodeAt(0))>>>0;
  const rnd=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296};
  const [a,b,acc]=pal;
  let dots='';for(let i=0;i<46;i++)dots+=`<circle cx="${(rnd()*320).toFixed(0)}" cy="${(rnd()*290).toFixed(0)}" r="${(rnd()*1.5+.4).toFixed(1)}" fill="#fff" opacity="${(rnd()*.55+.15).toFixed(2)}"/>`;
  const cx=(50+rnd()*220).toFixed(0),cy=(80+rnd()*90).toFixed(0),r=(34+rnd()*40).toFixed(0);
  const p1=`0,480 0,${(300+rnd()*50).toFixed(0)} ${(80+rnd()*60).toFixed(0)},${(200+rnd()*50).toFixed(0)} ${(170+rnd()*50).toFixed(0)},${(300+rnd()*40).toFixed(0)} 320,${(230+rnd()*50).toFixed(0)} 320,480`;
  const p2=`0,480 0,${(360+rnd()*40).toFixed(0)} ${(120+rnd()*60).toFixed(0)},${(300+rnd()*40).toFixed(0)} ${(230+rnd()*50).toFixed(0)},${(380+rnd()*30).toFixed(0)} 320,${(320+rnd()*40).toFixed(0)} 320,480`;
  const lines=wrapTitle(title.toUpperCase());
  let txt='';lines.forEach((l,i)=>{txt+=`<text x="24" y="${400+i*27}" font-family="Arial Black,Arial,sans-serif" font-size="${lines.length>2?21:25}" font-weight="900" fill="#fff" letter-spacing="1">${l.replace(/[<>&]/g,'')}</text>`});
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 480" width="320" height="480">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
<radialGradient id="s" cx="50%" cy="50%"><stop offset="0" stop-color="${acc}" stop-opacity=".95"/><stop offset="1" stop-color="${acc}" stop-opacity="0"/></radialGradient>
<linearGradient id="d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".82"/></linearGradient></defs>
<rect width="320" height="480" fill="url(#g)"/>${dots}
<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#s)"/><circle cx="${cx}" cy="${cy}" r="${(r/2.6).toFixed(0)}" fill="#fff" opacity=".22"/>
<polygon points="${p1}" fill="#000" opacity=".38"/><polygon points="${p2}" fill="#000" opacity=".55"/>
<rect y="330" width="320" height="150" fill="url(#d)"/>
<rect x="24" y="352" width="42" height="4" rx="2" fill="${acc}"/>
${txt}
<text x="24" y="${400+lines.length*27+4}" font-family="Arial,sans-serif" font-size="11" fill="#fff" opacity=".55" letter-spacing="3">GAMEQUILL · COVER</text>
<rect x="0.5" y="0.5" width="319" height="479" fill="none" stroke="#fff" stroke-opacity=".12"/></svg>`;
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}

/* ---------- мок-база игр (интеграции) ---------- */
/* демо-база: используется ТОЛЬКО кнопкой «Пример» (не выдаётся за реальные игры) */
const DEMO_GAMES=[
 {id:'neon-requiem',title:'Neon Requiem',year:2025,dev:'Voidline Studio',pub:'Nova Interactive',genres:['Action RPG','Киберпанк','Открытый мир'],plat:['PC','PS5','Xbox Series'],pal:['#ff2fb3','#12062b','#22d3ee'],
  r:{backloggd:8.4,igdb:82,metacritic:86,hltb:'38 ч.'},
  panaxReactions:{legendary:19.6,awesome:41.2,good:37.3,decent:0,dislike:2.0,awful:0},
  links:{backloggd:'https://www.backloggd.com/games/neon-requiem/',igdb:'https://www.igdb.com/games/neon-requiem',steam:'https://store.steampowered.com/app/2448510/Neon_Requiem/',rawg:'https://rawg.io/games/neon-requiem',metacritic:'https://www.metacritic.com/game/neon-requiem',hltb:'https://howlongtobeat.com/game?id=118402'},
  steam:{app:2448510,price:'1 999 ₽',old:'2 499 ₽',disc:'-20%',date:'14 мар. 2025',tags:['Экшен','RPG','Киберпанк','Сюжет']},
  trailer:{t:'Neon Requiem — официальный трейлер запуска',ch:'Voidline Studio',dur:'2:14',url:'https://www.youtube.com/watch?v=neonrequiem-trailer'},
  ws:[{t:'Neon Requiem: Фоторежим Deluxe',a:'KiraMods',s:'12 480'},{t:'Костюм «Неоновый самурай»',a:'Rin_Art',s:'5 213'}]},
 {id:'hollow-crown',title:'Hollow Crown',year:2024,dev:'Ashen Forge',pub:'Grim Publishing',genres:['Soulslike','Тёмное фэнтези','Хардкор'],plat:['PC','PS5'],pal:['#c8a24a','#14100a','#ff7a3d'],
  r:{backloggd:9.0,igdb:88,metacritic:91,hltb:'62 ч.'},
  links:{backloggd:'https://www.backloggd.com/games/hollow-crown/',igdb:'https://www.igdb.com/games/hollow-crown',steam:'https://store.steampowered.com/app/1904220/Hollow_Crown/',rawg:'https://rawg.io/games/hollow-crown',metacritic:'https://www.metacritic.com/game/hollow-crown',hltb:'https://howlongtobeat.com/game?id=98211'},
  steam:{app:1904220,price:'3 499 ₽',old:'',disc:'',date:'2 окт. 2024',tags:['Souls-like','Сложная','Тёмное фэнтези']},
  trailer:{t:'Hollow Crown — Cinematic Reveal',ch:'Ashen Forge',dur:'3:02',url:'https://www.youtube.com/watch?v=hollowcrown-reveal'},
  ws:[{t:'Hollow Crown: HD-текстуры доспехов',a:'ForgeFan',s:'31 902'}]},
 {id:'starlight-drift',title:'Starlight Drift',year:2023,dev:'Orbit Nine',pub:'Orbit Nine',genres:['Космосим','Исследование','Выживание'],plat:['PC','Switch'],pal:['#6ea8ff','#060a24','#b388ff'],
  r:{backloggd:7.6,igdb:74,metacritic:78,hltb:'45 ч.'},
  links:{backloggd:'https://www.backloggd.com/games/starlight-drift/',igdb:'https://www.igdb.com/games/starlight-drift',steam:'https://store.steampowered.com/app/1551360/Starlight_Drift/',rawg:'https://rawg.io/games/starlight-drift',metacritic:'https://www.metacritic.com/game/starlight-drift',hltb:'https://howlongtobeat.com/game?id=77120'},
  steam:{app:1551360,price:'899 ₽',old:'1 499 ₽',disc:'-40%',date:'19 июл. 2023',tags:['Космос','Выживание','Открытый мир']},
  trailer:{t:'Starlight Drift — исследование пояса Кеплера',ch:'Orbit Nine',dur:'1:48',url:'https://www.youtube.com/watch?v=starlightdrift-explore'},
  ws:[{t:'Starlight Drift: Русская озвучка',a:'RuVoice',s:'8 744'}]},
 {id:'pixel-dungeon-depths',title:'Pixel Dungeon Depths',year:2022,dev:'Byteforge',pub:'Indie Collective',genres:['Roguelike','Пиксель-арт','Подземелья'],plat:['PC','Mobile'],pal:['#7ee787','#14202b','#ffd166'],
  r:{backloggd:8.1,igdb:79,metacritic:80,hltb:'24 ч.'},
  links:{backloggd:'https://www.backloggd.com/games/pixel-dungeon-depths/',igdb:'https://www.igdb.com/games/pixel-dungeon-depths',steam:'https://store.steampowered.com/app/1201540/Pixel_Dungeon_Depths/',rawg:'https://rawg.io/games/pixel-dungeon-depths',metacritic:'https://www.metacritic.com/game/pixel-dungeon-depths',hltb:'https://howlongtobeat.com/game?id=65001'},
  steam:{app:1201540,price:'299 ₽',old:'',disc:'',date:'5 мая 2022',tags:['Рогалик','Пиксельная графика','Пошаговая']},
  trailer:{t:'Pixel Dungeon Depths — трейлер раннего доступа',ch:'Byteforge',dur:'1:12',url:'https://www.youtube.com/watch?v=pixeldepths-ea'},
  ws:[{t:'PDD: Мод «Бесконечные этажи»',a:'Digger',s:'2 118'}]},
 {id:'steel-vanguard',title:'Steel Vanguard',year:2025,dev:'Kite & Anchor',pub:'Warfront Games',genres:['Тактика','Мехи','Пошаговая'],plat:['PC','Xbox Series'],pal:['#ff8a3d','#171a22','#66d9ff'],
  r:{backloggd:7.9,igdb:76,metacritic:79,hltb:'31 ч.'},
  links:{backloggd:'https://www.backloggd.com/games/steel-vanguard/',igdb:'https://www.igdb.com/games/steel-vanguard',steam:'https://store.steampowered.com/app/2210880/Steel_Vanguard/',rawg:'https://rawg.io/games/steel-vanguard',metacritic:'https://www.metacritic.com/game/steel-vanguard',hltb:'https://howlongtobeat.com/game?id=121330'},
  steam:{app:2210880,price:'1 699 ₽',old:'1 999 ₽',disc:'-15%',date:'27 фев. 2025',tags:['Тактика','Мехи','Пошаговые бои','Кооп']},
  trailer:{t:'Steel Vanguard — тактический геймплей',ch:'Warfront Games',dur:'4:20',url:'https://www.youtube.com/watch?v=steelvanguard-tactics'},
  ws:[{t:'Steel Vanguard: Кампания «Ледяной фронт»',a:'Tactician',s:'6 431'}]},
 {id:'sakura-protocol',title:'Sakura Protocol',year:2026,dev:'Hanami Works',pub:'Hanami Works',genres:['JRPG','Аниме','Романтика'],plat:['PC','PS5','Switch'],pal:['#ff8fb1','#1b0f24','#7cf3d4'],
  r:{backloggd:8.7,igdb:84,metacritic:85,hltb:'52 ч.'},
  links:{backloggd:'https://www.backloggd.com/games/sakura-protocol/',igdb:'https://www.igdb.com/games/sakura-protocol',steam:'https://store.steampowered.com/app/2771230/Sakura_Protocol/',rawg:'https://rawg.io/games/sakura-protocol',metacritic:'https://www.metacritic.com/game/sakura-protocol',hltb:'https://howlongtobeat.com/game?id=130045'},
  steam:{app:2771230,price:'2 299 ₽',old:'',disc:'',date:'9 апр. 2026',tags:['JRPG','Аниме','Сюжет','Пошаговая']},
  trailer:{t:'Sakura Protocol — Opening Movie',ch:'Hanami Works',dur:'2:36',url:'https://www.youtube.com/watch?v=sakuraprotocol-op'},
  ws:[{t:'Sakura Protocol: Костюмы фестиваля',a:'HanamiFan',s:'19 208'}]},
 {id:'frostfall-saga',title:'Frostfall Saga',year:2024,dev:'Northwind',pub:'Northwind',genres:['Выживание','Открытый мир','Крафт'],plat:['PC'],pal:['#7fd4ff','#07131f','#a7ff9c'],
  r:{backloggd:7.2,igdb:70,metacritic:72,hltb:'40 ч.'},
  links:{backloggd:'https://www.backloggd.com/games/frostfall-saga/',igdb:'https://www.igdb.com/games/frostfall-saga',steam:'https://store.steampowered.com/app/1880210/Frostfall_Saga/',rawg:'https://rawg.io/games/frostfall-saga',metacritic:'https://www.metacritic.com/game/frostfall-saga',hltb:'https://howlongtobeat.com/game?id=88400'},
  steam:{app:1880210,price:'1 299 ₽',old:'1 599 ₽',disc:'-19%',date:'12 дек. 2024',tags:['Выживание','Открытый мир','Крафт','Зима']},
  trailer:{t:'Frostfall Saga — зимний трейлер',ch:'Northwind',dur:'2:05',url:'https://www.youtube.com/watch?v=frostfall-winter'},
  ws:[{t:'Frostfall: Карта мира 4K',a:'Carto',s:'3 877'}]},
 {id:'turbo-rally-legends',title:'Turbo Rally Legends',year:2023,dev:'Redline Games',pub:'Speedhouse',genres:['Гонки','Аркада','Сплит-скрин'],plat:['PC','PS5','Xbox'],pal:['#ffd23f','#1a1207','#ff4d6d'],
  r:{backloggd:6.8,igdb:65,metacritic:69,hltb:'15 ч.'},
  links:{backloggd:'https://www.backloggd.com/games/turbo-rally-legends/',igdb:'https://www.igdb.com/games/turbo-rally-legends',steam:'https://store.steampowered.com/app/2055990/Turbo_Rally_Legends/',rawg:'https://rawg.io/games/turbo-rally-legends',metacritic:'https://www.metacritic.com/game/turbo-rally-legends',hltb:'https://howlongtibeat.com/game?id=91220'},
  steam:{app:2055990,price:'749 ₽',old:'1 199 ₽',disc:'-38%',date:'3 авг. 2023',tags:['Гонки','Аркада','Мультиплеер','Ралли']},
  trailer:{t:'Turbo Rally Legends — ночная гонка',ch:'Speedhouse',dur:'1:33',url:'https://www.youtube.com/watch?v=turbo-rally-night'},
  ws:[{t:'TRL: Трасса «Северная петля»',a:'RallyMaker',s:'4 502'}]}
];
DEMO_GAMES.forEach(g=>{g.cover=coverArt(g.id,g.title,g.pal);g.demo=true});
/* результаты реального поиска (Steam) — заполняются GQ.search() */
let GAMES=[];

/* ---------- интеграции ---------- */
const DEF_INTEG=[
 {id:'panax',name:'PANAX',icon:'🎮',color:'#7c5cff',base:'https://panaxgames.com',enabled:true,ai:false},
 {id:'igdb',name:'IGDB',icon:'🕹️',color:'#9147ff',base:'https://www.igdb.com',enabled:true,ai:false},
 {id:'steam',name:'Steam Store',icon:'♨️',color:'#66c0f4',base:'https://store.steampowered.com',enabled:true,ai:false},
 {id:'workshop',name:'Steam Workshop',icon:'🛠️',color:'#66c0f4',base:'https://steamcommunity.com/workshop',enabled:true,ai:false},
 {id:'youtube',name:'YouTube',icon:'▶️',color:'#ff4d6d',base:'https://www.youtube.com',enabled:true,ai:false},
 {id:'rawg',name:'RAWG',icon:'🟡',color:'#f6c445',base:'https://rawg.io',enabled:true,ai:false},
 {id:'metacritic',name:'Metacritic',icon:'📊',color:'#ffcc33',base:'https://www.metacritic.com',enabled:false,ai:false},
 {id:'hltb',name:'HowLongToBeat',icon:'⏱️',color:'#e05353',base:'https://howlongtobeat.com',enabled:false,ai:false}
];
const SCORES=[null,
 {i:'💩',t:'Провал',d:'Не играйте ни при каких условиях'},
 {i:'🤢',t:'Ужасно',d:'Сломано, скучно, безнадежно'},
 {i:'😖',t:'Плохо',d:'Минусов сильно больше, чем плюсов'},
 {i:'😕',t:'Слабо',d:'Ниже среднего — много проблем'},
 {i:'😐',t:'Средне',d:'Проходняк на один вечер'},
 {i:'🙂',t:'Неплохо',d:'Есть за что похвалить и поругать'},
 {i:'😊',t:'Хорошо',d:'Крепкая работа, стоит внимания'},
 {i:'😍',t:'Отлично',d:'Один из лучших релизов жанра'},
 {i:'🤩',t:'Великолепно',d:'Почти идеал, мелкие огрехи'},
 {i:'👑',t:'Шедевр',d:'Эталон, обязателен к прохождению'}
];
const DEF_ASPECTS=['Сюжет','Графика','Геймплей','Оптимизация','Локализация'];
const UNRATED={unsure:'Автор не уверен в оценке этого аспекта',na:'К этой игре данный аспект не применим'};
const VERDICT={yes:{e:'👍',t:'Рекомендую'},neutral:{e:'🤔',t:'Нейтрально'},no:{e:'👎',t:'Не рекомендую'},none:{e:'❔',t:'Вердикт не выбран'}};
const TEXTY=['text','h2','h3','quote','spoiler'];

/* ---------- состояние ---------- */
const STORE='gamequill.v2';
let state={reviews:[],currentId:null,settings:{author:'Ваше имя',integrations:clone(DEF_INTEG),aiSearch:false}};
function save(silent){
  try{localStorage.setItem(STORE,JSON.stringify(state));}catch(e){toast('Не удалось сохранить: хранилище переполнено','err');return}
  if(!silent){const d=$('#saveDot'),t=$('#saveTxt');d.classList.add('busy');t.textContent='сохраняю…';
    setTimeout(()=>{d.classList.remove('busy');t.textContent='сохранено'},420)}
}
const saveSoon=debounce(()=>save(true),500);
function load(){
  try{const raw=localStorage.getItem(STORE);if(raw){const p=JSON.parse(raw);if(p&&p.reviews){state=Object.assign(state,p);
  if(state.settings&&Array.isArray(state.settings.integrations)){const seenI=new Set();state.settings.integrations=state.settings.integrations.map(x=>x&&x.id==='backloggd'?{id:'panax',name:'PANAX',icon:'🎮',color:'#7c5cff',base:'https://panaxgames.com',enabled:x.enabled!==false,ai:false}:x).filter(x=>x&&x.id&&!seenI.has(x.id)&&seenI.add(x.id));}
    if(!state.settings.integrations)state.settings.integrations=clone(DEF_INTEG)}}}catch(e){console.warn(e)}
}
const cur=()=>state.reviews.find(r=>r.id===state.currentId)||null;
function touch(){const r=cur();if(r){r.updatedAt=Date.now();saveSoon();renderSidebar();updateMeta()}}

function makeReview(seedDemo){
  return {id:uid(),title:'',game:'',createdAt:Date.now(),updatedAt:Date.now(),score:0,recommend:'none',
    aspects:DEF_ASPECTS.map(n=>({id:uid(),name:n,score:0,unrated:'unsure'})),pros:[],cons:[],blocks:[]};
}
function newReview(open=true){const r=makeReview();state.reviews.unshift(r);if(open){state.currentId=r.id}save(true);renderSidebar();renderEditor();toast('Новый обзор создан','ok');
  setTimeout(()=>$('#docTitle').focus(),120)}

/* ---------- тосты ---------- */
function toast(msg,kind=''){const t=document.createElement('div');t.className='toast '+kind;t.innerHTML=esc(msg);$('#toasts').appendChild(t);
  setTimeout(()=>{t.classList.add('out');setTimeout(()=>t.remove(),260)},2800)}

/* ==========================================================================
   САЙДБАР
   ========================================================================== */
function renderSidebar(){
  const q=($('#sbSearch').value||'').toLowerCase().trim();
  const list=$('#sbList');
  const items=state.reviews.filter(r=>!q||(r.title+' '+r.game+' '+(r.blocks||[]).map(b=>b.html||'').join(' ')).toLowerCase().includes(q));
  list.innerHTML='<div class="sb-sec">Мои обзоры · '+state.reviews.length+'</div>'+
   (items.length?items.map(r=>{
     const t=r.title||'Без названия';
     const st=r.score>0?'<span class="rv-stars">'+'★'.repeat(Math.round(r.score))+'<span style="opacity:.25">'+'★'.repeat(10-Math.round(r.score))+'</span></span>':'<span style="color:#4b5364">без оценки</span>';
     const v=r.recommend!=='none'?VERDICT[r.recommend].e:'';
     return `<div class="rv ${r.id===state.currentId?'on':''}" data-id="${r.id}">
       <div class="rv-t">${esc(t)}</div>
       <div class="rv-g">${r.game?esc(r.game):'игра не указана'}</div>
       <div class="rv-m">${st} <span>${r.score>0?r.score+'/10':''}</span> <span>${v}</span> <span style="margin-left:auto">${fmtDate(r.updatedAt)}</span></div>
       <button class="rv-del" data-del="${r.id}" title="Удалить">✕</button></div>`}).join('')
    :`<div class="empty" style="padding:26px 10px"><div class="big">🗂</div>Ничего не найдено</div>`);
}
function fmtDate(ts){if(!ts)return '—';const d=new Date(ts),n=Date.now()-ts;
  if(n<60000)return 'только что';if(n<3600000)return Math.floor(n/60000)+' мин назад';
  if(n<86400000)return Math.floor(n/3600000)+' ч назад';
  return d.toLocaleDateString('ru-RU',{day:'numeric',month:'short'})}
$('#sbList').addEventListener('click',e=>{
  const del=e.target.closest('[data-del]');
  if(del){e.stopPropagation();deleteReview(del.dataset.del);return}
  const it=e.target.closest('.rv');if(it){state.currentId=it.dataset.id;save(true);renderSidebar();renderEditor();
    if(innerWidth<980)$('#sidebar').classList.add('hide')}});
$('#sbSearch').addEventListener('input',renderSidebar);
function deleteReview(id){
  const r=state.reviews.find(x=>x.id===id);if(!r)return;
  if(!confirm('Удалить обзор «'+(r.title||'Без названия')+'»? Действие необратимо.'))return;
  state.reviews=state.reviews.filter(x=>x.id!==id);
  if(state.currentId===id)state.currentId=state.reviews[0]?state.reviews[0].id:null;
  save(true);renderSidebar();renderEditor();toast('Обзор удалён','warn')}

/* ==========================================================================
   РЕДАКТОР
   ========================================================================== */
function renderEditor(){
  const r=cur();
  $('#welcome').style.display=r?'none':'block';
  $('#doc').style.display=r?'block':'none';
  if(!r){renderWelcome();return}
  $('#docTitle').value=r.title||'';
  $('#docGame').value=r.game||'';
  renderScore();renderVerdict();renderAspects();renderBlocks();renderPC();updateMeta();
}
function renderWelcome(){
  const art=coverArt('welcome','Game Quill',['#7c5cff','#0b0d18','#22d3ee']);
  $('#welcomeArt').innerHTML=`<img src="${art}" alt="" style="width:150px;border-radius:14px;box-shadow:0 18px 50px rgba(124,92,255,.35)">`;
}
function updateMeta(){
  const r=cur();if(!r)return;
  $('#mAuthor').textContent='✍️ '+(state.settings.author||'Автор не указан');
  $('#mDate').textContent='📅 '+new Date(r.createdAt).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});
  const w=countWords();
  $('#mWords').textContent='🔤 '+w+' слов · '+r.blocks.length+' блок(ов)';
  $('#wordCount').textContent=w+' слов';
  $('#footL').textContent='GameQuill · создано '+new Date(r.createdAt).toLocaleString('ru-RU');
  $('#footR').textContent='изменено '+new Date(r.updatedAt).toLocaleString('ru-RU');
}
function countWords(){const r=cur();if(!r)return 0;
  const tmp=document.createElement('div');let txt=(r.title||'')+' '+(r.game||'');
  r.blocks.forEach(b=>{if(TEXTY.includes(b.type)){tmp.innerHTML=b.html||'';txt+=' '+tmp.textContent}});
  r.pros.forEach(p=>txt+=' '+p.text);r.cons.forEach(c=>txt+=' '+c.text);
  return txt.trim().split(/\s+/).filter(Boolean).length}

/* ---------- оценка ---------- */
function renderScore(){
  const r=cur();const row=$('#starsRow');
  row.innerHTML='';
  for(let i=1;i<=10;i++){
    const s=document.createElement('span');s.className='star'+(i<=r.score?' lit':'');s.textContent='★';s.dataset.v=i;
    row.appendChild(s);
  }
  $('#scNum').textContent=r.score>0?r.score:'—';
  const cap=$('#scCap');
  const sc=SCORES[r.score];
  cap.innerHTML=sc?`<span class="ico">${sc.i}</span><span><b>${sc.t}</b> · ${r.score}/10<span class="d">${sc.d}</span></span>
    <button class="sc-clear" data-a="clear-score">сбросить</button>`
   :`<span class="ico">🎯</span><span><b>Оценка не выставлена</b><span class="d">наведите курсор на звёзды — каждая оценка со своей подписью и иконкой</span></span>`;
}
$('#starsRow').addEventListener('mouseover',e=>{const s=e.target.closest('.star');if(!s)return;paintStars(+s.dataset.v,true)});
$('#starsRow').addEventListener('mouseleave',()=>{const r=cur();if(r)paintStars(r.score,false)});
$('#starsRow').addEventListener('click',e=>{const s=e.target.closest('.star');if(!s)return;const r=cur();const v=+s.dataset.v;
  r.score=(r.score===v?0:v);renderScore();touch();
  if(r.score>0){const st=$$('.star')[r.score-1];st.classList.add('pop');setTimeout(()=>st.classList.remove('pop'),360);
    toast('Оценка: '+r.score+'/10 — '+SCORES[r.score].t+' '+SCORES[r.score].i,'ok')}});
function paintStars(v,preview){$$('.star').forEach((s,i)=>{s.classList.toggle('lit',i<v)});
  const cap=$('#scCap');const sc=SCORES[v];
  if(preview&&sc)cap.innerHTML=`<span class="ico">${sc.i}</span><span><b>${sc.t}</b> · ${v}/10<span class="d">${sc.d}</span></span><span style="margin-left:auto;font-size:11px;color:var(--dim)">клик — поставить оценку</span>`;
  else if(!preview)renderScore()}
$('#scCap').addEventListener('click',e=>{if(e.target.closest('[data-a="clear-score"]')){cur().score=0;renderScore();touch()}});

/* ---------- вердикт ---------- */
function renderVerdict(){const r=cur();$$('#verdictBox .vb').forEach(b=>b.classList.toggle('on',b.dataset.v===r.recommend))}
$('#verdictBox').addEventListener('click',e=>{const b=e.target.closest('.vb');if(!b)return;const r=cur();
  r.recommend=(r.recommend===b.dataset.v?'none':b.dataset.v);renderVerdict();touch();
  toast('Вердикт: '+VERDICT[r.recommend].e+' '+VERDICT[r.recommend].t,'ok')});

/* ---------- аспекты ---------- */
function renderAspects(){
  const r=cur();const box=$('#aspList');
  box.innerHTML=r.aspects.map(a=>{
    const off=!a.score;
    let dots='';for(let i=1;i<=10;i++)dots+=`<span class="dot ${i<=a.score?'lit':''}" data-d="${i}"></span>`;
    return `<div class="asp ${off?'off':''}" data-asp="${a.id}">
      <input class="asp-n" value="${esc(a.name)}" data-f="name">
      ${off?`<select class="asp-sel" data-f="unrated">
          <option value="unsure" ${a.unrated==='unsure'?'selected':''}>Автор не уверен в оценке</option>
          <option value="na" ${a.unrated==='na'?'selected':''}>Аспект не применим к игре</option>
        </select>`:`<div class="dots">${dots}</div>`}
      <div class="asp-v">${a.score>0?a.score+'/10':'—'}</div>
      <button class="ghost" data-f="toggle" style="padding:5px 9px;font-size:11px">${off?'Оценить':'Не оценивать'}</button>
      <button class="asp-x" data-f="del">✕</button>
    </div>${off?`<div class="asp-note" style="margin:-2px 0 8px 10px">↳ ${esc(UNRATED[a.unrated]||UNRATED.unsure)}</div>`:''}`;
  }).join('')||'<div class="empty" style="padding:12px">Аспектов нет — добавьте свой</div>';
}
$('#aspList').addEventListener('click',e=>{
  const row=e.target.closest('.asp');if(!row)return;const r=cur();const a=r.aspects.find(x=>x.id===row.dataset.asp);if(!a)return;
  const dot=e.target.closest('[data-d]');
  if(dot){const v=+dot.dataset.d;a.score=(a.score===v?0:v);renderAspects();touch();return}
  const f=e.target.closest('[data-f]');if(!f)return;
  if(f.dataset.f==='toggle'){if(a.score){a.score=0}else{a.score=6}renderAspects();touch()}
  if(f.dataset.f==='del'){r.aspects=r.aspects.filter(x=>x.id!==a.id);renderAspects();touch()}
});
$('#aspList').addEventListener('change',e=>{
  const row=e.target.closest('.asp');if(!row)return;const a=cur().aspects.find(x=>x.id===row.dataset.asp);if(!a)return;
  const f=e.target.closest('[data-f]');if(!f)return;
  if(f.dataset.f==='name')a.name=f.value;if(f.dataset.f==='unrated')a.unrated=f.value;touch();renderAspects()});
function addAspect(name){const r=cur();if(!r)return;r.aspects.push({id:uid(),name:name||'Новый аспект',score:0,unrated:'unsure'});renderAspects();touch()}
$('#aspAdd').addEventListener('click',()=>{const i=$('#aspInput');if(!i.value.trim())return toast('Введите название аспекта','warn');addAspect(i.value.trim());i.value=''});
$('#aspInput').addEventListener('keydown',e=>{if(e.key==='Enter')$('#aspAdd').click()});

/* ---------- плюсы / минусы ---------- */
function renderPC(){
  const r=cur();
  ['pros','cons'].forEach(k=>{
    const box=$(k==='pros'?'#prosList':'#consList');
    box.innerHTML=r[k].length?r[k].map(it=>`<div class="pc-i" data-pc="${it.id}" data-k="${k}">
        <div class="pc-ic">${k==='pros'?'+':'−'}</div>
        <div class="pc-tx" contenteditable="true" data-ph="${k==='pros'?'Тезисно опишите плюс…':'Тезисно опишите минус…'}">${esc(it.text)}</div>
        <button class="pc-x" data-del="${it.id}">✕</button></div>`).join('')
      :`<div class="pc-empty">Пока пусто — добавьте ${k==='pros'?'плюс':'минус'}</div>`;
  });
}
document.addEventListener('click',e=>{
  const d=e.target.closest('[data-del]');
  if(d&&d.closest('.pc-i')){const it=d.closest('.pc-i'),k=it.dataset.k,id=it.dataset.pc;
    const r=cur();r[k]=r[k].filter(x=>x.id!==id);renderPC();touch()}
});
$('#pcSec').addEventListener('input',e=>{
  const t=e.target.closest('.pc-tx');if(!t)return;const it=t.closest('.pc-i'),r=cur();
  const o=r[it.dataset.k].find(x=>x.id===it.dataset.pc);if(o){o.text=t.innerText.replace(/\n+/g,' ')}touch()});
function addPC(k){const r=cur();const o={id:uid(),text:''};r[k].push(o);renderPC();touch();
  const node=$(`[data-pc="${o.id}"] .pc-tx`);if(node){node.focus()}}

/* ==========================================================================
   БЛОКИ
   ========================================================================== */
const PH={text:'Пишите текст обзора… Enter — новый блок, Shift+Enter — перенос строки',h2:'Заголовок раздела',h3:'Подзаголовок',quote:'Цитата или яркая мысль',spoiler:'Текст под спойлером…'};
const DEMO_GAME_IDS=new Set(['neon-requiem','hollow-crown','starlight-drift','pixel-dungeon-depths']);
function rxSum(rx){
  if(!rx||typeof rx!=='object')return 0;
  return ['legendary','awesome','good','decent','dislike','awful'].reduce((s,k)=>s+(Number(rx[k])||0),0);
}
function applyPanaxPatch(d,det){
  if(!d||!det)return false;
  let changed=false;
  if(det.panaxReactions&&rxSum(det.panaxReactions)>0){d.panaxReactions=det.panaxReactions;changed=true}
  if(det.cover&&!d.cover){d.cover=det.cover;changed=true}
  if(det.dev&&!d.dev){d.dev=det.dev;changed=true}
  if(det.pub&&!d.pub){d.pub=det.pub;changed=true}
  if(det.year&&!d.year){d.year=det.year;changed=true}
  if(det.genres&&det.genres.length&&!(d.genres&&d.genres.length)){d.genres=det.genres;changed=true}
  if(det.panaxUrl){d.links=Object.assign({},d.links||{},{panax:det.panaxUrl});changed=true}
  return changed;
}
function hydrateReviewGameBlocks(r){
  if(!r||!Array.isArray(r.blocks)||!window.GQ||typeof GQ.panaxResolveGame!=='function')return;
  for(const b of r.blocks){
    if(b.type!=='game'||!b.data||b._panaxHydrating)continue;
    if(DEMO_GAME_IDS.has(b.data.gameId))continue;
    if(rxSum(b.data.panaxReactions)>0)continue;
    b._panaxHydrating=true;
    GQ.panaxResolveGame(b.data).then(det=>{
      if(applyPanaxPatch(b.data,det)){touch();if(cur()===r)renderBlocks()}
    }).catch(()=>{});
  }
}
function renderBlocks(){
  const r=cur();const box=$('#blocksList');box.innerHTML='';
  if(!r.blocks.length){box.innerHTML=`<div class="empty"><div class="big">✍️</div>Обзор пока пустой.<br>Добавьте первый текстовый блок или виджет игры.</div>`;return}
  r.blocks.forEach(b=>box.appendChild(blockNode(b)));
  hydrateReviewGameBlocks(r);
}
function blockNode(b){
  const w=document.createElement('div');w.className='block b-'+b.type+(b.type==='spoiler'&&b.hidden?' hid':'');w.dataset.id=b.id;
  let body='';
  if(TEXTY.includes(b.type)){
    const tag=b.type==='spoiler'?`<div class="sp-tag">⚠️ спойлер <button class="g-btn" data-act="spoil" style="width:18px;height:18px;font-size:9px;margin-left:4px" title="Показать/скрыть">👁</button></div>`:'';
    body=tag+`<div class="ce" contenteditable="true" data-ph="${PH[b.type]||'Текст…'}">${b.html||''}</div>`;
  }else if(b.type==='divider'){
    body=`<hr class="divider d${(b.data&&b.data.style)||1}">`;
  }else{
    body=widgetHTML(b);
  }
  w.innerHTML=`<div class="gutter">
      <button class="g-btn" data-act="add" title="Вставить блок после">＋</button>
      <div class="g-tools">
        <button class="g-btn" data-act="up" title="Вверх">↑</button>
        <button class="g-btn" data-act="down" title="Вниз">↓</button>
        <button class="g-btn" data-act="del" title="Удалить блок">✕</button>
      </div></div><div class="b-body">${body}</div>`;
  return w;
}
function widgetHTML(b){
  const d=b.data||{};const tools=`<div class="w-tools">
      <button class="wt" data-act="edit" title="Изменить">✎</button>
      <button class="wt x" data-act="del" title="Удалить">✕</button></div>`;
  if(b.type==='game'){
    return renderGameCard(d,tools);
  }
  if(b.type==='steam'){
    return `<div class="w w-steam">${tools}
      <div class="ws-head"><img class="ws-cap" src="${esc(d.cover||coverArt(d.app||d.title||'s',d.title||'Steam',GQ.palette(d.app||d.title||'s')))}" alt="">
        <div><div class="ws-t">${esc(d.title||'Игра в Steam')}</div>
        <div class="ws-s">В магазине Steam ${d.date?'· выпуск '+esc(d.date):''}${d.app?' · app '+esc(d.app):''}</div>
        <div class="ws-tags">${(d.tags||[]).map(t=>`<span>${esc(t)}</span>`).join('')}</div></div></div>
      <div class="ws-body">
        <div class="ws-price">${d.disc?`<span class="disc">${esc(d.disc)}</span>`:''}${d.old?`<span class="old">${esc(d.old)}</span>`:''}<span class="now">${esc(d.price||'Не указана')}</span></div>
        <a class="ws-btn" href="${esc(d.url||'#')}" target="_blank" rel="noopener">Открыть в Steam →</a>
      </div></div>`;
  }
  if(b.type==='youtube'){
    return `<div class="w w-yt">${tools}
      <a class="yt-thumb" href="${esc(d.url||'#')}" target="_blank" rel="noopener" style="background-image:url('${cssUrl(d.cover||coverArt(d.url||d.title||'yt',d.title||'Video',GQ.palette(d.url||'yt')))}')">
        <span class="yt-play">▶</span>${d.dur?`<span class="yt-dur">${esc(d.dur)}</span>`:''}</a>
      <div class="yt-info"><div class="yt-t">${esc(d.title||'Видео')}</div>
        <div class="yt-c">${esc(d.channel||'Канал')} · YouTube</div>
        <a class="yt-go" href="${esc(d.url||'#')}" target="_blank" rel="noopener">▶ Смотреть на YouTube</a></div></div>`;
  }
  if(b.type==='workshop'){
    return `<div class="w w-ws">${tools}
      <div class="ws-ic">🛠️</div>
      <div><div class="ws-tt">${esc(d.title||'Предмет мастерской')}</div>
      <div class="ws-ss">Мастерская Steam · автор ${esc(d.author||'—')}${d.subs?' · 👥 '+esc(d.subs)+' подписчиков':''}${d.game?' · '+esc(d.game):''}</div></div>
      <a class="ws-sub" href="${esc(d.url||'#')}" target="_blank" rel="noopener">Подписаться</a></div>`;
  }
  return `<div class="w" style="padding:14px">${tools}Неизвестный виджет</div>`;
}
function rxBadgeSrc(badge){
  try{if(typeof chrome!=='undefined'&&chrome.runtime&&chrome.runtime.getURL)return chrome.runtime.getURL(badge)}catch{}
  return '../'+badge;
}
function panaxReactionList(d){
  const rx=d.panaxReactions||{};
  const defs=[
    {k:'legendary',name:'Легенда',color:'#f3cb16',icon:'🏆',badge:'ratings/legendary-on.png'},
    {k:'awesome',name:'Круто',color:'#f2a000',icon:'🤘',badge:'ratings/awesome-on.png'},
    {k:'good',name:'Хорошо',color:'#bd55e9',icon:'😄',badge:'ratings/good-on.png'},
    {k:'decent',name:'Норм',color:'#3c9df3',icon:'✋',badge:'ratings/decent-on.png'},
    {k:'dislike',name:'Плохо',color:'#8ea6af',icon:'😞',badge:'ratings/dislike-on.png'},
    {k:'awful',name:'Ужас',color:'#e34d68',icon:'🤢',badge:'ratings/awful-on.png'}
  ];
  return defs.map(x=>({
    k:x.k,
    name:x.name,
    color:x.color,
    icon:x.icon,
    badge:rxBadgeSrc(x.badge),
    val:Number.isFinite(Number(rx[x.k]))?Number(rx[x.k]):0
  }));
}
function duetSummary(rx,total){
  if(total<=0)return 'Оценки появятся после первых реакций игроков на Panax.';
  const pos=rx.slice(0,3).reduce((s,x)=>s+x.val,0);
  const neg=rx.slice(4).reduce((s,x)=>s+x.val,0);
  if(pos>=85)return 'Подавляющее большинство игроков оценило игру положительно.';
  if(pos>=70)return 'Почти 4 из 5 реакций — положительные впечатления.';
  if(pos>=55)return 'Большинство реакций сообщества — положительные.';
  if(neg>=50)return 'Сообщество восприняло игру сдержанно или критически.';
  return 'Впечатления игроков разделились поровну.';
}
function splitTypeTitle(title){
  const words=String(title||'Игра').trim().toUpperCase().split(/\s+/).filter(Boolean);
  if(words.length<2)return esc(words[0]||'ИГРА');
  const mid=Math.ceil(words.length/2);
  return `${esc(words.slice(0,mid).join(' '))}<br><i>${esc(words.slice(mid).join(' '))}</i>`;
}
function renderGameCard(d,tools){
  const extraList=(typeof GQ!=='undefined'&&GQ.extraCardVariants)?GQ.extraCardVariants():[];
  const extraIds=extraList.map(x=>x.id);
  const valid=['classic','duet','editorial','staircase','type','brutal',...extraIds];
  const v=valid.includes(d.variant)?d.variant:'classic';
  const cover=d.cover||coverArt(d.gameId||d.title||'g',d.title||'Game',GQ.palette(d.gameId||d.title||'g'));
  const srcs=Object.keys(d.links||{}).map(k=>integ(k)).filter(Boolean);
  const panaxUrl=(d.links&&(d.links.panax||d.links.backloggd||d.links.igdb))||'#';
  const rx=panaxReactionList(d);
  if(extraIds.includes(v)&&typeof GQ!=='undefined'&&GQ.renderExtraGameCard){
    const html=GQ.renderExtraGameCard(v,Object.assign({},d,{cover}),tools||'',rx);
    if(html)return html;
  }
  const rxTotal=rx.reduce((s,x)=>s+x.val,0);
  const sorted=[...rx].sort((a,b)=>b.val-a.val);
  const top1=sorted[0];
  const top2=sorted[1];
  const yearNum=String(d.year||'').replace(/\D/g,'');
  const codeNum=yearNum?'0'+yearNum.slice(-2):'PANAX';
  const metaParts=[d.year,d.dev,d.pub].filter(Boolean).map(x=>esc(String(x)));

  if(v==='duet'){
    return `<div class="w w-game v-duet">${tools}
      <div class="duet-head">
        <div>
          <div class="kicker">PLAYER IMPRESSION</div>
          <h2 class="game-title">${esc(d.title||'Игра')}</h2>
          <div class="game-meta">${metaParts.join(' <i>·</i> ')||'PANAX'}</div>
          ${(d.genres||[]).length?`<div class="genres">${(d.genres||[]).slice(0,4).map(g=>`<span>${esc(g)}</span>`).join('')}</div>`:''}
        </div>
        <img class="duet-cover" src="${esc(cover)}" alt="Обложка ${esc(d.title||'Игра')}">
      </div>
      <div class="duet-panel">
        <div class="duet-label">ДВА ГЛАВНЫХ ОТКЛИКА СООБЩЕСТВА</div>
        <div class="duet-pair">
          <div class="duet-choice">
            <img class="badge" src="${esc(top1.badge)}" alt="${esc(top1.name)}" loading="eager">
            <div><b>${esc(top1.name)}</b><strong>${top1.val.toFixed(1)}%</strong></div>
          </div>
          <div class="duet-vs">+</div>
          <div class="duet-choice">
            <img class="badge" src="${esc(top2.badge)}" alt="${esc(top2.name)}" loading="eager">
            <div><b>${esc(top2.name)}</b><strong>${top2.val.toFixed(1)}%</strong></div>
          </div>
        </div>
        <div class="duet-note">${esc(duetSummary(rx,rxTotal))}</div>
      </div>
      <div class="duet-foot">
        <div class="mini-dots" aria-label="Цвета остальных реакций">${rx.map(x=>`<i style="--c:${x.color}" title="${esc(x.name)}: ${x.val.toFixed(1)}%"></i>`).join('')}</div>
        <span>6 РЕАКЦИЙ PANAX</span>
        <a class="panax-link" href="${esc(panaxUrl)}" target="_blank" rel="noopener noreferrer">Оценки на Panax <span aria-hidden="true">↗</span></a>
      </div></div>`;
  }
  if(v==='editorial'){
    const rest=rx.filter(x=>x.k!==top1.k);
    const edMeta=[d.dev,...(d.genres||[]).slice(0,3)].filter(Boolean);
    const edNote=rxTotal<=0?'Ожидаются первые оценки сообщества PANAX.'
      :(top1.val>=35?'Почти каждый второй игрок<br>оставил эту реакцию.'
      :'Лидирующая реакция среди<br>оценок сообщества PANAX.');
    return `<div class="w w-game v-editorial">${tools}
      <div class="ed-top">
        <div class="ed-index">GAME / ${esc(codeNum)}<br><b>PLAYER<br>VERDICT</b></div>
        <div class="ed-head">
          <div class="game-head">
            <div class="kicker">PANAX PLAYER REACTIONS${d.year?' · '+esc(d.year):''}</div>
            <div class="game-title">${esc((d.title||'Игра').toUpperCase())}</div>
            <div class="game-meta">${edMeta.map(x=>esc(x)).join(' <span aria-hidden="true">·</span> ')||'Сообщество PANAX'}</div>
          </div>
        </div>
      </div>
      <div class="ed-feature">
        <div class="ed-feature-label">САМАЯ ЧАСТАЯ РЕАКЦИЯ</div>
        <div class="ed-feature-main">
          <span>${top1.icon}</span>
          <b>${esc(top1.name.toUpperCase())}</b>
          <strong style="color:${top1.k==='awesome'?'#d78a00':top1.color}">${top1.val.toFixed(1)}<small>%</small></strong>
        </div>
        <div class="ed-feature-note">${edNote}</div>
      </div>
      <div class="ed-rest">${rest.map(x=>`<div class="ed-row" style="--c:${x.color};--v:${x.val.toFixed(1)}%"><span>${x.icon}</span><b>${esc(x.name)}</b><i><em style="width:${x.val.toFixed(1)}%;background:${x.color}"></em></i><strong>${x.val.toFixed(1)}%</strong></div>`).join('')}</div>
      <div class="ed-foot">
        <span>ЦИФРЫ СООБЩЕСТВА PANAX</span>
        <a class="panax-link" href="${esc(panaxUrl)}" target="_blank" rel="noopener noreferrer">Оценки на Panax <span aria-hidden="true">↗</span></a>
      </div></div>`;
  }
  if(v==='staircase'){
    return `<div class="w w-game v-staircase">${tools}
      <div class="stairs-head">
        <div>
          <div class="kicker">REACTION LEVELS / PANAX</div>
          <div class="game-title">${esc((d.title||'Игра').toUpperCase())}</div>
          <div class="game-meta">От максимального восторга до полного разочарования</div>
        </div>
        <div class="stairs-number">06<span>LEVELS</span></div>
      </div>
      <div class="stairs-chart">${rx.map((x,i)=>`<div class="step step${i+1}" style="--c:${x.color};--v:${x.val.toFixed(1)}%">
        <div class="step-cap"><span>${x.icon}</span><b>${x.val.toFixed(1)}%</b></div>
        <div class="step-fill" style="height:${x.val.toFixed(1)}%;background:${x.color}"></div>
        <label>${esc(x.name)}</label>
      </div>`).join('')}</div>
      <div class="stairs-foot">
        <span>ОЦЕНКИ СООБЩЕСТВА</span>
        <a class="panax-link" href="${esc(panaxUrl)}" target="_blank" rel="noopener noreferrer">Оценки на Panax <span aria-hidden="true">↗</span></a>
      </div></div>`;
  }
  if(v==='type'){
    const devWords=String(d.dev||'PANAX').trim().toUpperCase().split(/\s+/).filter(Boolean);
    const devHtml=devWords.length>1?`${esc(devWords.slice(0,-1).join(' '))}<br>${esc(devWords[devWords.length-1])}`:esc(devWords[0]||'PANAX');
    const genreTag=String((d.genres&&d.genres[0])||(d.plat&&d.plat[0])||'PANAX').toUpperCase();
    return `<div class="w w-game v-type typecard">${tools}
      <div class="type-meta">
        <span>PANAX / GAME REACTION INDEX</span>
        <span>${esc(d.year||'PANAX')} — № ${esc(codeNum)}</span>
      </div>
      <div class="type-hero">
        <div class="game-title">${splitTypeTitle(d.title||'Игра')}</div>
        <div class="type-aside">${devHtml}<span>${esc(genreTag)}</span></div>
      </div>
      <div class="type-rule">
        <span>КАК ИГРУ ВОСПРИНЯЛИ</span>
        <span>${rxTotal>0?'100% ОТВЕТОВ':'НЕТ ОЦЕНОК'}</span>
      </div>
      <div class="type-list">${rx.map(x=>`<div class="type-row" style="--c:${x.color};--v:${x.val.toFixed(1)}%">
        <span class="type-symbol">${x.icon}</span>
        <b>${esc(x.name)}</b>
        <div class="type-track"><i style="width:${x.val.toFixed(1)}%;background:${x.color}"></i></div>
        <strong>${x.val.toFixed(1)}<small>%</small></strong>
      </div>`).join('')}</div>
      <div class="type-foot">
        <span>МНЕНИЕ ИГРОКОВ — НЕ РЕЦЕНЗИЯ</span>
        <a class="panax-link" href="${esc(panaxUrl)}" target="_blank" rel="noopener noreferrer">Оценки на Panax <span aria-hidden="true">↗</span></a>
      </div></div>`;
  }
  if(v==='brutal'){
    const devMeta=[d.year,d.dev].filter(Boolean).join(' · ').toUpperCase()||'PANAX';
    return `<div class="w w-game v-brutal">${tools}
      <div class="br-left">
        <div class="br-top">
          <div class="br-poster"><img src="${esc(cover)}" alt=""></div>
          <div>
            <div class="br-dev">${esc(devMeta)}</div>
            <h3 class="br-title">${esc(d.title||'Игра')}</h3>
          </div>
        </div>
        <div class="br-bottom">
          <div>
            <div class="br-dom-lbl">ДОМИНИРУЕТ</div>
            <div class="br-leader">${top1.val.toFixed(1)}% ${esc(top1.name.toUpperCase())}</div>
          </div>
          <a class="br-link" href="${esc(panaxUrl)}" target="_blank" rel="noopener noreferrer">PANAXGAMES →</a>
        </div>
      </div>
      <div class="br-table">${rx.map(x=>`<div class="br-cell">
        <span class="br-cname">${esc(x.name.toUpperCase())}</span>
        <span class="br-cval">${x.val.toFixed(1)}%</span>
      </div>`).join('')}</div></div>`;
  }

  const badges=srcs.filter(s=>d.ratings&&d.ratings[s.id]!=null).map(s=>`<span class="badge">${esc(s.icon)} ${esc(d.ratings[s.id])} · ${esc(s.name)}</span>`).join('');
  return `<div class="w w-game v-classic">${tools}
    <img class="w-cover" src="${esc(cover)}" alt="">
    <div class="w-info">
      <div class="w-kick">🎮 карточка игры ${d.source?'· '+esc(d.source):''}</div>
      <div class="w-title">${esc(d.title||'Игра')}</div>
      <div class="w-sub">${esc([d.year,d.dev,d.pub].filter(Boolean).join(' · '))}</div>
      <div class="w-tags">${(d.genres||[]).map(g=>`<span>${esc(g)}</span>`).join('')}</div>
      <div class="w-badges">${badges}</div>
      <div class="w-links">${srcs.map(s=>d.links[s.id]?`<a class="srcbtn" style="--c:${esc(GQ.color(s.color))}" href="${esc(d.links[s.id])}" target="_blank" rel="noopener">${esc(s.icon)} ${esc(s.name)}</a>`:'').join('')}</div>
    </div></div>`;
}
function integ(id){return state.settings.integrations.find(i=>i.id===id&&i.enabled)||state.settings.integrations.find(i=>i.id===id)}
function enabledInteg(){return state.settings.integrations.filter(i=>i.enabled)}

function addBlock(type,afterId,data){
  const r=cur();if(!r)return;
  const b={id:uid(),type};
  if(TEXTY.includes(type))b.html='';
  if(type==='divider')b.data={style:1};
  if(data)b.data=data;
  let idx=afterId?r.blocks.findIndex(x=>x.id===afterId)+1:r.blocks.length;
  if(idx<0)idx=r.blocks.length;
  r.blocks.splice(idx,0,b);touch();renderBlocks();updateMeta();
  if(TEXTY.includes(type))focusBlock(b.id);
  return b;
}
function focusBlock(id){const n=$(`.block[data-id="${id}"] .ce`);if(!n)return;n.focus();
  const rg=document.createRange();rg.selectNodeContents(n);rg.collapse(false);
  const s=getSelection();s.removeAllRanges();s.addRange(s?rg:rg)}
function findBlock(id){const r=cur();return r?r.blocks.find(b=>b.id===id):null}
function moveBlock(id,dir){const r=cur();const i=r.blocks.findIndex(b=>b.id===id);const j=i+dir;
  if(i<0||j<0||j>=r.blocks.length)return;const t=r.blocks[i];r.blocks[i]=r.blocks[j];r.blocks[j]=t;touch();renderBlocks()}
function delBlock(id){const r=cur();r.blocks=r.blocks.filter(b=>b.id!==id);touch();renderBlocks();updateMeta();toast('Блок удалён','warn')}

/* --- события блоков --- */
$('#blocksList').addEventListener('input',e=>{
  const ce=e.target.closest('.ce');if(!ce)return;
  const node=ce.closest('.block');const b=findBlock(node.dataset.id);if(!b)return;
  b.html=ce.innerHTML;touch();updateMeta();
});
$('#blocksList').addEventListener('keydown',e=>{
  const ce=e.target.closest('.ce');if(!ce)return;const node=ce.closest('.block');const b=findBlock(node.dataset.id);
  if(e.key==='Enter'&&!e.shiftKey){
    if(document.queryCommandValue('insertUnorderedList')||document.queryCommandValue('insertOrderedList')||ce.querySelector('li'))return;
    e.preventDefault();
    const sel=getSelection();let after='';
    if(sel&&sel.rangeCount){const rg=sel.getRangeAt(0);const tail=rg.cloneRange();tail.selectNodeContents(ce);tail.setStart(rg.endContainer,rg.endOffset);
      const frag=tail.cloneContents();const tmp=document.createElement('div');tmp.appendChild(frag);after=tmp.innerHTML;tail.deleteContents();}
    b.html=ce.innerHTML;
    const nb=addBlock(b.type==='quote'?'text':b.type==='h2'||b.type==='h3'?'text':b.type,node.id);
    if(nb&&after&&after!=='<br>'){nb.html=after;renderBlocks();focusBlock(nb.id);touch()}
    return;
  }
  if(e.key==='Backspace'&&ce.textContent.trim()===''&&!ce.querySelector('li,img')){
    const r=cur();const i=r.blocks.findIndex(x=>x.id===b.id);
    if(i>0){e.preventDefault();const prev=r.blocks[i-1];delBlock(b.id);if(TEXTY.includes(prev.type))focusBlock(prev.id)}
    else if(r.blocks.length>1){e.preventDefault();delBlock(b.id)}
  }
});
$('#blocksList').addEventListener('paste',e=>{
  const ce=e.target.closest('.ce');if(!ce)return;
  e.preventDefault();
  const html=e.clipboardData.getData('text/html');const txt=e.clipboardData.getData('text/plain');
  if(html){const clean=sanitize(html,true);document.execCommand('insertHTML',false,clean)}
  else document.execCommand('insertText',false,txt);
  const b=findBlock(ce.closest('.block').dataset.id);if(b){b.html=ce.innerHTML;touch()}
});
$('#blocksList').addEventListener('click',e=>{
  const node=e.target.closest('.block');if(!node)return;const id=node.dataset.id;const b=findBlock(id);if(!b)return;
  const act=e.target.closest('[data-act]');
  if(act){const a=act.dataset.act;
    if(a==='del')return delBlock(id);
    if(a==='up')return moveBlock(id,-1);
    if(a==='down')return moveBlock(id,1);
    if(a==='add')return openBlockMenu(act,id);
    if(a==='edit')return openInsert(b.type,{replace:id});
    if(a==='spoil'){b.hidden=!b.hidden;node.classList.toggle('hid',b.hidden);touch();return}
    if(a==='dst'){b.data=b.data||{};b.data.style=((+b.data.style||1)%3)+1;renderBlocks();touch();return}
  }
});
/* меню добавления блока */
const BMENU=[
 {t:'text',e:'¶',n:'Текстовый блок',d:'обычный абзац'},
 {t:'h2',e:'H2',n:'Заголовок',d:'крупный раздел'},
 {t:'h3',e:'H3',n:'Подзаголовок',d:'средний раздел'},
 {t:'quote',e:'❝',n:'Цитата',d:'выделенная мысль'},
 {t:'spoiler',e:'👁',n:'Спойлер',d:'скрытый текст'},
 {t:'divider',e:'—',n:'Разделитель',d:'горизонтальная линия'},
 {sep:1},
 {t:'ins:game',e:'🎮',n:'Карточка игры',d:'PANAX / Steam / IGDB'},
 {t:'ins:steam',e:'♨️',n:'Виджет Steam',d:'страница в магазине'},
 {t:'ins:youtube',e:'▶️',n:'Видео YouTube',d:'трейлер или обзор'},
 {t:'ins:workshop',e:'🛠️',n:'Мастерская Steam',d:'пользовательский контент'}
];
function openBlockMenu(anchor,afterId){
  const m=$('#blockMenu');
  m.innerHTML='<div class="pop-h">Вставить блок</div>'+BMENU.map(i=>i.sep?'<div class="pop-sep"></div>':
    `<button class="pop-i" data-t="${i.t}"><span class="e">${i.e}</span><span>${i.n}<small>${i.d}</small></span></button>`).join('');
  const r=anchor.getBoundingClientRect();
  m.style.left=Math.min(r.left,innerWidth-240)+'px';m.style.top=(r.bottom+6)+'px';m.classList.add('on');
  m.dataset.after=afterId||'';
}
$('#blockMenu').addEventListener('click',e=>{
  const it=e.target.closest('[data-t]');if(!it)return;const t=it.dataset.t;const after=$('#blockMenu').dataset.after||null;
  $('#blockMenu').classList.remove('on');
  if(t.startsWith('ins:'))return openInsert(t.slice(4),{after});
  addBlock(t,after);
});
document.addEventListener('click',e=>{
  if(!e.target.closest('#blockMenu')&&!e.target.closest('[data-act="add"]')&&!e.target.closest('[data-a="add-block"]'))$('#blockMenu').classList.remove('on');
  if(!e.target.closest('#expMenu')&&!e.target.closest('[data-a="exp-menu"]'))$('#expMenu').classList.remove('on');
});

/* ==========================================================================
   ФОРМАТИРОВАНИЕ
   ========================================================================== */
let savedRange=null;
function saveSel(){const s=getSelection();if(s&&s.rangeCount)savedRange=s.getRangeAt(0).cloneRange()}
function restoreSel(){if(!savedRange)return false;const s=getSelection();s.removeAllRanges();s.addRange(savedRange);return true}
function currentCe(){const s=getSelection();if(!s||!s.rangeCount)return null;
  let n=s.anchorNode;if(n&&n.nodeType===3)n=n.parentNode;return n?n.closest('.ce'):null}
function syncBlock(ce){if(!ce)return;const node=ce.closest('.block');if(!node)return;const b=findBlock(node.dataset.id);if(b){b.html=ce.innerHTML;touch();updateMeta()}}
function exec(cmd,val){document.execCommand('styleWithCSS',false,false);document.execCommand(cmd,false,val||null)}

document.addEventListener('mousedown',e=>{
  const b=e.target.closest('.rb-btn,.flt button,.pop-i');
  if(b&&(b.dataset.cmd||b.dataset.a||b.dataset.t))e.preventDefault();
  if(e.target.closest('.ce'))setTimeout(saveSel,0);
});
document.addEventListener('click',e=>{
  const btn=e.target.closest('[data-cmd],[data-a]');if(!btn)return;
  const cmd=btn.dataset.cmd,act=btn.dataset.a,val=btn.dataset.v;
  if(cmd){
    const ce=currentCe();if(!ce&&!['undo','redo'].includes(cmd))return toast('Поставьте курсор в текстовый блок','warn');
    if(ce)ce.focus();
    restoreSel();exec(cmd);syncBlock(ce);refreshFlt();return;
  }
  if(!act)return;
  switch(act){
    case 'new':newReview();break;
    case 'dup':duplicate();break;
    case 'save':save();toast('Обзор сохранён 💾','ok');break;
    case 'del':if(cur())deleteReview(cur().id);break;
    case 'demo':seedDemo(true);break;
    case 'settings':openSettings();break;
    case 'import':$('#fileIn').click();break;
    case 'exp-menu':openExpMenu(btn);break;
    case 'exp-md':download(currentMd(),fileName(cur()||{})+'.md');break;
    case 'exp-md-all':download(allMd(),'GameQuill-все-обзоры.md');break;
    case 'exp-gq':downloadGQ(false);break;
    case 'exp-gq-all':downloadGQ(true);break;
    case 'copy-md':copyMd();break;
    case 'insert':openInsert(val,{});break;
    case 'add-block':addBlock(val,afterCaretBlock());break;
    case 'mark':wrapSel('<mark>','</mark>');break;
    case 'code':wrapSel('<code>','</code>');break;
    case 'color':exec('foreColor',val);syncBlock(currentCe());break;
    case 'size-up':exec('fontSize','5');syncBlock(currentCe());break;
    case 'size-down':exec('fontSize','2');syncBlock(currentCe());break;
    case 'link':case 'gamelink':openLink(val==='chip');break;
    case 'block':setType(val);break;
    case 'focus-score':$('#starsRow').scrollIntoView({block:'center'});$('#starsRow').animate([{opacity:.4},{opacity:1}],{duration:600,iterations:2});break;
    case 'focus-aspects':$('#aspectsSec').scrollIntoView({block:'center'});break;
    case 'focus-pc':$('#pcSec').scrollIntoView({block:'center'});break;
    case 'verdict':{const r=cur();r.recommend=(r.recommend===val?'none':val);renderVerdict();touch();break}
    case 'add-aspect':{const n=prompt('Название аспекта:','Звук и музыка');if(n)addAspect(n);break}
    case 'add-pro':addPC('pros');break;
    case 'add-con':addPC('cons');break;
  }
});
function afterCaretBlock(){const ce=currentCe();if(!ce)return null;const n=ce.closest('.block');return n?n.dataset.id:null}
function wrapSel(pre,post){const ce=currentCe();if(!ce)return toast('Выделите текст в блоке','warn');
  ce.focus();restoreSel();const s=getSelection();const txt=s&&s.toString();
  if(!txt)return toast('Сначала выделите текст','warn');
  exec('insertHTML',pre+esc(txt)+post);syncBlock(ce)}
function setType(t){const ce=currentCe();if(!ce)return toast('Поставьте курсор в текстовый блок','warn');
  const node=ce.closest('.block');const b=findBlock(node.dataset.id);if(!b)return;
  if(!TEXTY.includes(b.type))return toast('Это виджет — тип блока не меняется','warn');
  b.type=t;node.className='block b-'+t;touch();renderBlocks();
  const n2=$(`.block[data-id="${b.id}"] .ce`);if(n2)n2.focus()}
function duplicate(){const r=cur();if(!r)return;const c=clone(r);c.id=uid();c.title=(r.title||'Без названия')+' (копия)';c.createdAt=Date.now();c.updatedAt=Date.now();
  state.reviews.unshift(c);state.currentId=c.id;save(true);renderSidebar();renderEditor();toast('Копия создана','ok')}

/* ==========================================================================
   ПЛАВАЮЩАЯ ПАНЕЛЬ ВЫДЕЛЕНИЯ
   ========================================================================== */
const FLT=[
 {c:'bold',e:'<b>Ж</b>',t:'Жирный'},{c:'italic',e:'<i>К</i>',t:'Курсив'},{c:'underline',e:'<u>Ч</u>',t:'Подчёркнутый'},
 {c:'strikeThrough',e:'<s>З</s>',t:'Зачёркнутый'},{sep:1},
 {a:'mark',e:'🖍',t:'Маркер'},{a:'code',e:'&lt;/&gt;',t:'Код'},
 {a:'color',v:'#ff5f6d',e:'<span class="fl-sw" style="background:#ff5f6d"></span>',t:'Красный'},
 {a:'color',v:'#ffc84a',e:'<span class="fl-sw" style="background:#ffc84a"></span>',t:'Жёлтый'},
 {a:'color',v:'#3ddc97',e:'<span class="fl-sw" style="background:#3ddc97"></span>',t:'Зелёный'},
 {a:'color',v:'#22d3ee',e:'<span class="fl-sw" style="background:#22d3ee"></span>',t:'Голубной'},
 {sep:1},{c:'removeFormat',e:'⌫',t:'Очистить формат'},
 {a:'link',e:'🔗',t:'Ссылка (Ctrl+K)'},{sep:1},
 {a:'gamelink',e:'🎮 <span style="font-size:11px">Игра</span>',t:'Ссылка на игру из интеграций',cls:'game-btn'}
];
$('#flt').innerHTML=FLT.map(b=>b.sep?'<span class="d"></span>':
 `<button class="${b.cls||''}" ${b.c?'data-cmd="'+b.c+'"':'data-a="'+b.a+'"'} ${b.v?'data-v="'+b.v+'"':''} title="${b.t}">${b.e}</button>`).join('');
function refreshFlt(){
  const f=$('#flt');const s=getSelection();
  const ce=currentCe();
  if(!ce||!s||s.isCollapsed||!s.toString().trim()){f.classList.remove('on');return}
  const rect=s.getRangeAt(0).getBoundingClientRect();
  if(!rect||(!rect.width&&!rect.height)){f.classList.remove('on');return}
  f.classList.add('on');
  const w=f.offsetWidth||420;
  let l=rect.left+rect.width/2-w/2;l=Math.max(8,Math.min(l,innerWidth-w-8));
  let t=rect.top-f.offsetHeight-12;if(t<8)t=rect.bottom+12;
  f.style.left=l+'px';f.style.top=t+'px';
  ['bold','italic','underline','strikeThrough'].forEach(c=>{
    const btn=f.querySelector(`[data-cmd="${c}"]`);if(!btn)return;
    try{btn.classList.toggle('on',document.queryCommandState(c))}catch(e){}});
}
document.addEventListener('selectionchange',debounce(()=>{saveSel();refreshFlt()},90));
document.addEventListener('mouseup',()=>setTimeout(()=>{saveSel();refreshFlt()},10));
document.addEventListener('keyup',e=>{if(e.shiftKey||e.key.startsWith('Arrow'))setTimeout(()=>{saveSel();refreshFlt()},10)});
$('#canvas').addEventListener('scroll',()=>$('#flt').classList.remove('on'));

/* ==========================================================================
   МОДАЛКА ВСТАВКИ (игры, YouTube, Steam, Мастерская, URL)
   ========================================================================== */
let insCtx={tab:'game',q:'',src:'all',sel:null,after:null,replace:null};
const INS_TABS=[{id:'game',n:'🎮 Игра'},{id:'youtube',n:'▶️ YouTube'},{id:'steam',n:'♨️ Steam'},{id:'workshop',n:'🛠️ Мастерская'},{id:'url',n:'🧩 По ссылке'}];
function openInsert(tab,ctx={}){
  const existing=ctx.replace?findBlock(ctx.replace):null;
  insCtx={
    tab:tab||'game',
    q:(existing&&existing.data&&existing.data.title)||'',
    src:'all',
    sel:null,
    variant:(existing&&existing.data&&existing.data.variant)||'classic',
    after:ctx.after||null,
    replace:ctx.replace||null,
    mode:ctx.replace?'edit':'new'
  };
  $('#insTabs').innerHTML=INS_TABS.map(t=>`<button class="tab ${t.id===insCtx.tab?'on':''}" data-tab="${t.id}">${t.n}</button>`).join('');
  $('#insTitle').textContent=insCtx.replace?'Изменить виджет':'Вставка виджета';
  $('#insSub').textContent=insCtx.replace?'Замените данные виджета':'Найдите игру — виджет соберётся автоматически из подключённых интеграций';
  renderInsBody();$('#insModal').classList.add('on');
  if(insCtx.q&&insCtx.q.trim().length>=2&&typeof gqSearch==='function')gqSearch(insCtx.q.trim());
  setTimeout(()=>{const i=$('#insQ');if(i)i.focus()},80);
}
$('#insTabs').addEventListener('click',e=>{const t=e.target.closest('[data-tab]');if(!t)return;
  insCtx.tab=t.dataset.tab;insCtx.sel=null;$$('#insTabs .tab').forEach(x=>x.classList.toggle('on',x.dataset.tab===insCtx.tab));renderInsBody()});
function searchGames(q){return GAMES}
function renderInsBody(){
  const b=$('#insBody');const srcs=enabledInteg();
  if(insCtx.tab==='game'){
    b.innerHTML=`<div class="srch"><input class="inp" id="insQ" placeholder="Поиск игры по названию, жанру, студии…" value="${esc(insCtx.q)}"></div>
      <div class="fchips"><button class="fchip ${insCtx.src==='all'?'on':''}" data-src="all">Все интеграции</button>
      ${srcs.map(s=>`<button class="fchip ${insCtx.src===s.id?'on':''}" data-src="${esc(s.id)}">${esc(s.icon)} ${esc(s.name)}</button>`).join('')}</div>
      <div class="gsplit"><div><div class="gres" id="gRes"></div></div><div id="gDet"></div></div>`;
    drawGames();drawDetail();
    $('#insQ').addEventListener('input',e=>{insCtx.q=e.target.value;drawGames()});
    $$('#insBody .fchip').forEach(c=>c.addEventListener('click',()=>{insCtx.src=c.dataset.src;renderInsBody()}));
    return;
  }
  if(insCtx.tab==='youtube'){
    b.innerHTML=`<div class="srch"><input class="inp" id="insQ" placeholder="Поиск трейлеров и видео по играм…" value="${esc(insCtx.q)}"></div>
      <div id="ytList"></div>
      <div class="pop-sep" style="margin:16px 0"></div>
      <div class="pop-h" style="padding:0 0 8px">Или вставьте свою ссылку YouTube</div>
      <div class="field"><label>URL видео</label><input class="inp" id="ytUrl" placeholder="https://www.youtube.com/watch?v=…"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="field"><label>Название</label><input class="inp" id="ytT" placeholder="Название ролика"></div>
        <div class="field"><label>Канал</label><input class="inp" id="ytC" placeholder="Название канала"></div></div>
      <button class="pri" id="ytGo">▶ Вставить виджет видео</button>`;
    drawYT();
    $('#insQ').addEventListener('input',e=>{insCtx.q=e.target.value;drawYT()});
    $('#ytGo').addEventListener('click',()=>{
      const url=$('#ytUrl').value.trim();if(!url)return toast('Вставьте URL видео','warn');
      const d={title:$('#ytT').value.trim()||ytTitleFromUrl(url),channel:$('#ytC').value.trim()||'YouTube',url,dur:'',cover:''};
      const g=GAMES.find(g=>url.includes(g.id));if(g){d.cover=g.cover;d.title=d.title||g.trailer.t;d.channel=d.channel||g.trailer.ch;d.dur=g.trailer.dur}
      commit('youtube',d)});
    return;
  }
  if(insCtx.tab==='steam'){
    b.innerHTML=`<div class="srch"><input class="inp" id="insQ" placeholder="Поиск страницы в магазине Steam…" value="${esc(insCtx.q)}"></div>
      <div id="stList"></div>
      <div class="pop-sep" style="margin:16px 0"></div>
      <div class="pop-h" style="padding:0 0 8px">Или ссылка на страницу Steam</div>
      <div class="field"><input class="inp" id="stUrl" placeholder="https://store.steampowered.com/app/…"></div>
      <button class="pri" id="stGo">♨️ Сгенерировать виджет Steam</button>`;
    drawSteam();
    $('#insQ').addEventListener('input',e=>{insCtx.q=e.target.value;drawSteam()});
    $('#stGo').addEventListener('click',()=>{const u=$('#stUrl').value.trim();if(!u)return toast('Вставьте ссылку Steam','warn');
      const g=GAMES.find(x=>u.includes(x.id)||u.includes(String(x.steam.app)));
      const d=g?steamData(g):{title:titleFromUrl(u),url:u,cover:'',tags:[],price:'',disc:'',old:'',date:''};
      commit('steam',d)});
    return;
  }
  if(insCtx.tab==='workshop'){
    b.innerHTML=`<div class="srch"><input class="inp" id="insQ" placeholder="Поиск предметов Мастерской Steam…" value="${esc(insCtx.q)}"></div><div id="wsList"></div>
      <div class="pop-sep" style="margin:16px 0"></div>
      <div class="field"><label>Ссылка на предмет мастерской / UGC</label><input class="inp" id="wsUrl" placeholder="https://steamcommunity.com/sharedfiles/filedetails/?id=…"></div>
      <div class="field"><label>Название предмета</label><input class="inp" id="wsT" placeholder="Название"></div>
      <button class="pri" id="wsGo">🛠️ Вставить виджет мастерской</button>`;
    drawWS();
    $('#insQ').addEventListener('input',e=>{insCtx.q=e.target.value;drawWS()});
    $('#wsGo').addEventListener('click',()=>{const u=$('#wsUrl').value.trim();if(!u)return toast('Вставьте ссылку','warn');
      commit('workshop',{title:$('#wsT').value.trim()||titleFromUrl(u),author:'Автор',subs:'',url:u,game:''})});
    return;
  }
  if(insCtx.tab==='url'){
    b.innerHTML=`<div class="field"><label>Любая ссылка</label><input class="inp" id="uUrl" placeholder="https://…"></div>
      <div class="field"><label>Что вставить</label>
        <select class="inp" id="uKind">
          <option value="chip">🎮 Чип-ссылка на игру (в текст)</option>
          <option value="lnk">🔗 Обычная ссылка на выделенный текст</option>
          <option value="game">🃏 Карточка игры</option>
          <option value="steam">♨️ Виджет Steam</option>
          <option value="youtube">▶️ Виджет YouTube</option>
          <option value="workshop">🛠️ Виджет Мастерской</option>
        </select></div>
      <div class="field"><label>Название (если нужно)</label><input class="inp" id="uTitle" placeholder="Автоопределение по URL"></div>
      <div id="uHint" style="font-size:11.5px;color:var(--dim);margin-bottom:12px"></div>
      <button class="pri" id="uGo">Вставить</button>`;
    $('#uUrl').addEventListener('input',()=>{const u=$('#uUrl').value;const d=detectSource(u);
      $('#uHint').innerHTML=d?`Определён сервис: <b style="color:${esc(GQ.color(d.color))}">${esc(d.icon)} ${esc(d.name)}</b>`:'Сервис не опознан — будет обычная ссылка'});
    $('#uGo').addEventListener('click',()=>{
      const u=$('#uUrl').value.trim();if(!u)return toast('Введите URL','warn');
      const kind=$('#uKind').value;const title=$('#uTitle').value.trim()||titleFromUrl(u);
      const ds=detectSource(u);const g=GAMES.find(x=>u.includes(x.id))||null;
      if(kind==='chip'){insertChip(title,u,ds);closeModal('insModal');return}
      if(kind==='lnk'){insertLink(title,u);closeModal('insModal');return}
      let d={title,cover:g?g.cover:'',url:u,source:ds?ds.name:''};
      if(kind==='game'&&g)d=gameData(g);
      if(kind==='steam')d=g?steamData(g):Object.assign({tags:[],price:'',disc:'',old:'',date:''},d);
      if(kind==='youtube')d=g?Object.assign(ytData(g),{url:u}):Object.assign({channel:'YouTube',dur:''},d);
      if(kind==='workshop')d=Object.assign({author:'Автор',subs:'',game:g?g.title:''},d);
      commit(kind,d)});
    return;
  }
}
let panaxResults=[],panaxLastQ='',panaxTimer=0;
function normGameKey(t){return String(t||'').toLowerCase().replace(/[™®©:\-–—'’"`.,!?/()\[\]]+/g,' ').replace(/\s+/g,' ').trim()}
function combinedGamesList(){
  const q=insCtx.q.trim();
  const base=searchGames(insCtx.q);
  if(q.length<2||!panaxResults.length)return base;
  const map=new Map();
  const list=[];
  for(const p of panaxResults){
    const key=normGameKey(p.title);
    const copy=Object.assign({},p,{links:Object.assign({},p.links||{})});
    list.push(copy);
    if(key&&!map.has(key))map.set(key,copy);
  }
  for(const s of base){
    const key=normGameKey(s.title);
    const match=key?map.get(key):null;
    if(match){
      if(!match.cover&&s.cover)match.cover=s.cover;
      if(!match.dev&&s.dev)match.dev=s.dev;
      if(!match.pub&&s.pub)match.pub=s.pub;
      if(!(match.genres&&match.genres.length)&&s.genres&&s.genres.length)match.genres=s.genres;
      if(!(match.plat&&match.plat.length)&&s.plat&&s.plat.length)match.plat=s.plat;
      if(!match.steam&&s.steam)match.steam=s.steam;
      if(!match.r&&s.r)match.r=s.r;
      match.links=Object.assign({},s.links||{},match.links||{});
    }else{
      list.push(s);
    }
  }
  return list;
}
function findSelectedGame(id){
  if(!id)return null;
  return combinedGamesList().find(x=>x.id===id)||panaxResults.find(x=>x.id===id)||GAMES.find(x=>x.id===id)||null;
}
function drawGames(){
  const box=$('#gRes');if(!box)return;
  const q=insCtx.q.trim();
  if(q.length>=2&&q!==panaxLastQ&&window.GQ&&typeof GQ.panaxSearch==='function'){
    panaxLastQ=q;clearTimeout(panaxTimer);
    panaxTimer=setTimeout(async()=>{
      try{const res=await GQ.panaxSearch(q);if(insCtx.q.trim()===q&&Array.isArray(res)){panaxResults=res;drawGames();if(insCtx.sel)drawDetail()}}catch{}
    },90);
  }else if(q.length<2){panaxResults=[];panaxLastQ='';}
  let list=combinedGamesList();
  if(insCtx.src!=='all')list=list.filter(g=>g.links&&g.links[insCtx.src]);
  box.innerHTML=list.length?list.map(g=>`<div class="gcard ${insCtx.sel===g.id?'on':''}" data-g="${esc(g.id)}">
      <img src="${esc(g.cover||coverArt(g.id,g.title,GQ.palette(g.id)))}" alt=""><div class="n"><b>${esc(g.title)}</b><i>${esc([g.year,g.dev].filter(Boolean).join(' · ')||g.source||'PANAX')}</i></div></div>`).join('')
    :`<div class="empty" style="grid-column:1/-1"><div class="big">🔍</div>Ничего не найдено.<br><small>Добавьте свою ссылку во вкладке «По ссылке»</small></div>`;
  $$('#gRes .gcard').forEach(c=>c.addEventListener('click',()=>{insCtx.sel=c.dataset.g;drawGames();drawDetail()}));
}
function hydrateGameCandidate(g){
  if(!g||g._panaxLoaded||g._panaxLoading||!window.GQ||typeof GQ.panaxResolveGame!=='function')return;
  g._panaxLoading=true;
  GQ.panaxResolveGame(g).then(det=>{
    g._panaxLoading=false;g._panaxLoaded=true;
    if(det){
      applyPanaxPatch(g,det);
      if(det.panaxId&&!g.panaxId)g.panaxId=det.panaxId;
      if(det.panaxReactions)g.panaxReactions=det.panaxReactions;
      const orig=panaxResults.find(x=>x.id===g.id)||GAMES.find(x=>x.id===g.id);
      if(orig&&orig!==g){
        applyPanaxPatch(orig,det);
        if(det.panaxId&&!orig.panaxId)orig.panaxId=det.panaxId;
        if(det.panaxReactions)orig.panaxReactions=det.panaxReactions;
        orig._panaxLoaded=true;orig._panaxLoading=false;
      }
      if(insCtx.sel===g.id)drawDetail();
      drawGames();
    }
  }).catch(()=>{g._panaxLoading=false;g._panaxLoaded=true});
}
function drawDetail(){
  const box=$('#gDet');if(!box)return;
  const g=findSelectedGame(insCtx.sel);
  if(!g){box.innerHTML=`<div class="gdet"><div class="empty" style="padding:26px 8px"><div class="big">🎮</div>Выберите игру слева —<br>здесь появятся варианты вставки</div></div>`;return}
  hydrateGameCandidate(g);
  const srcs=enabledInteg().filter(s=>g.links&&g.links[s.id]);
  const r=g.r||{};
  const rx=panaxReactionList(g);
  const topRx=[...rx].sort((a,b)=>b.val-a.val)[0];
  const hasRx=rxSum(g.panaxReactions)>0;
  const curVar=insCtx.variant||'classic';
  const BASE_VARIANTS=[
    {id:'classic',cat:'numeric',group:'Базовые',name:'🃏 Классика'},
    {id:'duet',cat:'panax',group:'Базовые PANAX',name:'🎭 Дуэт (топ-2 реакции)'},
    {id:'editorial',cat:'panax',group:'Базовые PANAX',name:'📰 Вердикт (редакция)'},
    {id:'staircase',cat:'panax',group:'Базовые PANAX',name:'📊 Лестница (график)'},
    {id:'type',cat:'panax',group:'Базовые PANAX',name:'🔤 Типографика (шкалы)'},
    {id:'brutal',cat:'panax',group:'Базовые PANAX',name:'⬛ Брутализм (таблица)'}
  ];
  const EXTRA_V=(typeof GQ!=='undefined'&&GQ.extraCardVariants)?GQ.extraCardVariants():[];
  const CARD_VARIANTS=[...BASE_VARIANTS,...EXTRA_V];
  const numVars=CARD_VARIANTS.filter(x=>x.cat==='numeric');
  const panaxVars=CARD_VARIANTS.filter(x=>x.cat==='panax');
  const renderVarGroup=(cat,title,list)=>{
    let out=`<div class="var-dd-cat" data-cat="${cat}">${title} <small>(${list.length})</small></div>`;
    let lastGrp='';
    for(const v of list){
      if(v.group&&v.group!==lastGrp){lastGrp=v.group;out+=`<div class="var-dd-grp" data-cat="${cat}">${esc(v.group)}</div>`}
      out+=`<button type="button" class="var-dd-opt${v.id===curVar?' on':''}" data-cat="${cat}" data-var="${esc(v.id)}">${esc(v.name||v.label)}</button>`;
    }
    return out;
  };
  const curVarObj=CARD_VARIANTS.find(x=>x.id===curVar)||CARD_VARIANTS[0];
  box.innerHTML=`<div class="gdet">
    <img src="${esc(g.cover||coverArt(g.id,g.title,GQ.palette(g.id)))}" style="width:100%;height:130px;object-fit:cover;border-radius:11px;margin-bottom:11px">
    <h4>${esc(g.title)}</h4>
    <div class="muted">${esc([g.year,[g.dev,g.pub].filter(Boolean).join(' / ')].filter(Boolean).join(' · '))}<br>${esc((g.genres||[]).join(', '))}<br>${esc((g.plat||[]).join(' · '))}</div>
    <div class="w-badges">${srcs.filter(s=>r[s.id]!=null).map(s=>`<span class="badge">${esc(s.icon)} ${esc(r[s.id])}</span>`).join('')}${hasRx?`<span class="badge">${topRx.icon} ${esc(topRx.name)} · ${topRx.val.toFixed(1)}%</span>`:(g._panaxLoading?`<span class="badge">⏳ PANAX…</span>`:'')}</div>
    <div class="pop-h" style="padding:12px 0 6px">Дизайн карточки (${CARD_VARIANTS.length})</div>
    <div class="var-dd" id="gCardVarDd">
      <input type="hidden" id="gCardVar" value="${esc(curVar)}">
      <button type="button" class="inp var-dd-btn" id="gCardVarBtn" aria-expanded="false">
        <span class="var-dd-lbl">${esc(curVarObj.name||curVarObj.label)}</span>
        <span class="var-dd-arr">▾</span>
      </button>
      <div class="var-dd-menu" id="gCardVarMenu">
        <div class="var-dd-tabs">
          <button type="button" class="var-dd-tab on" data-filter="all">Все (${CARD_VARIANTS.length})</button>
          <button type="button" class="var-dd-tab" data-filter="numeric">📊 Числовые (${numVars.length})</button>
          <button type="button" class="var-dd-tab" data-filter="panax">🎭 PANAX (${panaxVars.length})</button>
        </div>
        <div class="var-dd-list" id="gCardVarList">
          ${renderVarGroup('numeric','📊 Числовая оценка (Backloggd / 8.4 / 87%)',numVars)}
          ${renderVarGroup('panax','🎭 Оценки PANAX (Легенда / Круто / ...)',panaxVars)}
        </div>
        <div class="var-dd-preview" id="gCardVarPreview"><div class="var-dd-preview-inner" id="gCardVarPreviewInner"></div></div>
      </div>
    </div>
    <div class="pop-h" style="padding:4px 0 6px">Вставить как</div>
    <div class="ins-list" id="gInsList">
      <button class="ins-b" data-ins="game"><span class="e">🃏</span><span>Карточка игры<small>обложка, оценки, все источники</small></span></button>
      ${g.steam?`<button class="ins-b" data-ins="steam"><span class="e">♨️</span><span>Виджет Steam<small>цена, теги, кнопка магазина</small></span></button>`:''}
      ${g.trailer?`<button class="ins-b" data-ins="youtube"><span class="e">▶️</span><span>Видео-карточка<small>трейлер ${esc(g.trailer.dur)}</small></span></button>`:''}
      ${g.ws?`<button class="ins-b" data-ins="workshop"><span class="e">🛠️</span><span>Предмет Мастерской<small>${g.ws.length} шт. в базе</small></span></button>`:''}
      <button class="ins-b" data-ins="chip"><span class="e">🎮</span><span>Ссылка в тексте<small>чип на страницу игры</small></span></button>
      <div class="var-dd-preview ins-preview" id="gInsPreview"><div class="var-dd-preview-inner" id="gInsPreviewInner"></div></div>
    </div>
    <div class="pop-h" style="padding:14px 0 6px">Страницы игры</div>
    <div class="w-links">${srcs.map(s=>`<a class="srcbtn" style="--c:${esc(GQ.color(s.color))}" href="${esc(g.links[s.id])}" target="_blank" rel="noopener">${esc(s.icon)} ${esc(s.name)}</a>`).join('')}</div>
  </div>`;
  const varDd=$('#gCardVarDd'),varSel=$('#gCardVar'),varBtn=$('#gCardVarBtn'),varMenu=$('#gCardVarMenu'),varPrev=$('#gCardVarPreview'),varPrevIn=$('#gCardVarPreviewInner');
  if(varDd&&varSel&&varBtn&&varMenu&&varPrev&&varPrevIn){
    const showPreview=v=>{
      varPrevIn.innerHTML=renderGameCard(Object.assign(gameData(g),{variant:v}),'');
      varPrev.classList.add('show');
      varPrev.classList.remove('flip-left');
      const rect=varPrev.getBoundingClientRect();
      if(rect.right>window.innerWidth-12)varPrev.classList.add('flip-left');
    };
    const closeDd=()=>{varDd.classList.remove('open');varBtn.setAttribute('aria-expanded','false');varPrev.classList.remove('show')};
    varBtn.addEventListener('click',e=>{
      e.stopPropagation();
      const willOpen=!varDd.classList.contains('open');
      if(willOpen){varDd.classList.add('open');varBtn.setAttribute('aria-expanded','true');showPreview(varSel.value||'classic')}
      else closeDd();
    });
    $$('.var-dd-tab',varMenu).forEach(tab=>tab.addEventListener('click',e=>{
      e.stopPropagation();
      const f=tab.dataset.filter;
      $$('.var-dd-tab',varMenu).forEach(x=>x.classList.toggle('on',x===tab));
      $$('[data-cat]',varMenu).forEach(el=>{
        el.style.display=(f==='all'||el.dataset.cat===f)?'':'none';
      });
    }));
    $$('.var-dd-opt',varMenu).forEach(opt=>{
      opt.addEventListener('mouseenter',()=>showPreview(opt.dataset.var));
      opt.addEventListener('focus',()=>showPreview(opt.dataset.var));
      opt.addEventListener('click',()=>{
        const v=opt.dataset.var;
        varSel.value=v;
        insCtx.variant=v;
        const lbl=varBtn.querySelector('.var-dd-lbl');
        if(lbl)lbl.textContent=opt.textContent;
        $$('.var-dd-opt',varMenu).forEach(x=>x.classList.toggle('on',x.dataset.var===v));
        closeDd();
      });
    });
    varMenu.addEventListener('mouseleave',()=>varPrev.classList.remove('show'));
    document.addEventListener('click',e=>{if(!document.body.contains(varDd))return;if(!varDd.contains(e.target))closeDd()},{capture:true});
  }
  const insList=$('#gInsList'),insPrev=$('#gInsPreview'),insPrevIn=$('#gInsPreviewInner');
  if(insList&&insPrev&&insPrevIn){
    const showInsPreview=(k,btn)=>{
      let html='';
      if(k==='game')html=widgetHTML({type:'game',data:Object.assign(gameData(g),{variant:(varSel&&varSel.value)||insCtx.variant||'classic'})});
      else if(k==='steam')html=widgetHTML({type:'steam',data:steamData(g)});
      else if(k==='youtube')html=widgetHTML({type:'youtube',data:ytData(g)});
      else if(k==='workshop'&&g.ws&&g.ws[0])html=widgetHTML({type:'workshop',data:g.ws[0]});
      else if(k==='chip')html=`<div style="padding:20px 18px;font-size:15px;line-height:1.6;color:#e6e8f0">В тексте статьи: <a class="chip" href="#" onclick="return false">🎮 ${esc(g.title)}</a></div>`;
      if(!html){insPrev.classList.remove('show');return}
      insPrevIn.innerHTML=html;
      insPrev.style.top=Math.max(0,btn.offsetTop)+'px';
      insPrev.classList.add('show');
      insPrev.classList.remove('flip-left');
      if(insPrev.getBoundingClientRect().right>window.innerWidth-12)insPrev.classList.add('flip-left');
    };
    $$('[data-ins]',insList).forEach(btn=>{
      btn.addEventListener('mouseenter',()=>showInsPreview(btn.dataset.ins,btn));
      btn.addEventListener('focus',()=>showInsPreview(btn.dataset.ins,btn));
    });
    insList.addEventListener('mouseleave',()=>insPrev.classList.remove('show'));
  }
  $$('#gDet [data-ins]').forEach(btn=>btn.addEventListener('click',()=>{
    const k=btn.dataset.ins;
    if(k==='chip'){insertChip(g.title,(g.links&&(g.links.panax||g.links.backloggd||g.links.igdb))||'#',integ('panax')||integ('igdb'));closeModal('insModal');return}
    if(k==='workshop'){insCtx.tab='workshop';insCtx.q=g.title;$$('#insTabs .tab').forEach(x=>x.classList.toggle('on',x.dataset.tab==='workshop'));renderInsBody();return}
    if(k==='game'){const v=($('#gCardVar')&&$('#gCardVar').value)||insCtx.variant||'classic';insCtx.variant=v;commit('game',Object.assign(gameData(g),{variant:v}));return}
    const d=k==='steam'?steamData(g):ytData(g);
    commit(k,d)}));
}
function gameData(g){
  const srcs=enabledInteg();const links={};srcs.forEach(s=>{if(g.links&&g.links[s.id])links[s.id]=g.links[s.id]});
  if(g.links&&g.links.panax&&!links.panax)links.panax=g.links.panax;
  const gr=g.r||g.ratings||{};const ratings={};srcs.forEach(s=>{if(gr[s.id]!=null)ratings[s.id]=gr[s.id]});
  const gameId=g.panaxId?('panax_'+g.panaxId):(g.id||'');
  return {gameId,title:g.title,year:g.year,dev:g.dev,pub:g.pub,genres:g.genres,plat:g.plat,cover:g.cover,links,ratings,panaxReactions:g.panaxReactions||null,source:(integ('panax')||srcs[0]||{}).name||''};
}
function steamData(g){return {title:g.title,app:String(g.steam.app),price:g.steam.price,old:g.steam.old,disc:g.steam.disc,date:g.steam.date,tags:g.steam.tags,cover:g.cover,url:g.links.steam}}
function ytData(g){return {title:g.trailer.t,channel:g.trailer.ch,dur:g.trailer.dur,url:g.trailer.url,cover:g.cover}}
function drawYT(){
  const box=$('#ytList');if(!box)return;const q=insCtx.q.toLowerCase().trim();
  const list=GAMES.slice();
  box.innerHTML=list.length?list.map(g=>`<div class="ins-b" data-yt="${g.id}"><span class="e">▶️</span>
     <span>${esc(g.trailer.t)}<small>${esc(g.trailer.ch)}${g.trailer.dur?' · '+esc(g.trailer.dur):''}</small></span></div>`).join('')
   :`<div class="empty">Ничего не найдено</div>`;
  $$('#ytList [data-yt]').forEach(el=>el.addEventListener('click',()=>{const g=GAMES.find(x=>x.id===el.dataset.yt);commit('youtube',ytData(g))}));
}
function drawSteam(){
  const box=$('#stList');if(!box)return;const q=insCtx.q.toLowerCase().trim();
  const list=GAMES.slice();
  box.innerHTML=list.length?list.map(g=>`<div class="ins-b" data-st="${g.id}"><span class="e">♨️</span>
     <span>${esc(g.title)}<small>app ${esc(g.steam.app)} · ${esc(g.steam.price||'цена не указана')}${g.steam.disc?' ('+esc(g.steam.disc)+')':''}${g.steam.tags.length?' · '+esc(g.steam.tags.join(', ')):''}</small></span></div>`).join('')
   :`<div class="empty">Ничего не найдено</div>`;
  $$('#stList [data-st]').forEach(el=>el.addEventListener('click',()=>{const g=GAMES.find(x=>x.id===el.dataset.st);commit('steam',steamData(g))}));
}
function drawWS(){
  const box=$('#wsList');if(!box)return;const q=insCtx.q.toLowerCase().trim();
  const items=[];GAMES.forEach(g=>g.ws.forEach(w=>items.push({g,w})));
  const list=items.filter(({g,w})=>!q||(g.title+' '+w.t+' '+w.a).toLowerCase().includes(q));
  box.innerHTML=list.length?list.map(({g,w},i)=>`<div class="ins-b" data-ws="${i}"><span class="e">🛠️</span>
     <span>${esc(w.t)}<small>${esc(g.title)} · автор ${esc(w.a)} · 👥 ${esc(w.s)}</small></span></div>`).join('')
   :`<div class="empty">Ничего не найдено</div>`;
  $$('#wsList [data-ws]').forEach(el=>el.addEventListener('click',()=>{
    const {g,w}=list[+el.dataset.ws];
    commit('workshop',{title:w.t,author:w.a,subs:w.s,game:g.title,url:w.url||'',cover:g.cover})}));
}
function commit(type,data){
  closeModal('insModal');
  if(insCtx.replace){const b=findBlock(insCtx.replace);if(b){b.data=data;b.type=type;touch();renderBlocks();toast('Виджет обновлён','ok')}return b||null}
  const b=addBlock(type,insCtx.after,data);
  toast('Виджет добавлен: '+({game:'карточка игры',steam:'Steam',youtube:'видео',workshop:'мастерская'}[type]||type),'ok');
  if(b)setTimeout(()=>{const n=$(`.block[data-id="${b.id}"]`);if(n)n.scrollIntoView({block:'center',behavior:'smooth'})},60);
  return b||null;
}
function detectSource(u){
  const s=state.settings.integrations.find(i=>{try{return i.base&&new URL(u).hostname.includes(new URL(i.base).hostname.replace('www.',''))}catch(e){return false}});
  return s||null;
}
function titleFromUrl(u){try{const p=new URL(u);return decodeURIComponent(p.pathname.split('/').filter(Boolean).pop()||p.hostname).replace(/[-_]+/g,' ')}catch(e){return u}}
function ytTitleFromUrl(u){try{const m=new URL(u);return 'Видео '+(m.searchParams.get('v')||'')}catch(e){return 'Видео YouTube'}}
function insertChip(title,url,src){
  const ce=currentCe();
  const html=`<a class="game-chip" href="${esc(url)}" target="_blank" rel="noopener" data-src="${src?esc(src.id):''}"><i>${src?esc(src.icon):'🎮'}</i>${esc(title)}</a>&nbsp;`;
  if(ce){ce.focus();if(restoreSel()){const s=getSelection();if(!s.isCollapsed)s.deleteContents()}document.execCommand('insertHTML',false,html);syncBlock(ce);toast('Ссылка на игру вставлена 🎮','ok')}
  else{const b=addBlock('text',null);const n=$(`.block[data-id="${b.id}"] .ce`);if(n){n.focus();document.execCommand('insertHTML',false,html);b.html=n.innerHTML;touch()}toast('Добавлен блок со ссылкой на игру','ok')}
}
function insertLink(text,url){
  const ce=currentCe();
  if(!ce)return toast('Выделите текст в блоке, чтобы обернуть его в ссылку','warn');
  ce.focus();restoreSel();
  const html=`<a class="lnk" href="${esc(url)}" target="_blank" rel="noopener">${esc(text||url)}</a>`;
  const s=getSelection();if(s&&!s.isCollapsed)s.deleteContents();
  document.execCommand('insertHTML',false,html);syncBlock(ce);toast('Ссылка добавлена 🔗','ok');
}
function openLink(chip){
  saveSel();const s=getSelection();
  $('#linkTxt').value=s&&!s.isCollapsed?s.toString():'';
  $('#linkUrl').value='';$('#linkStyle').value=chip?'chip':'lnk';
  $('#linkModal').classList.add('on');setTimeout(()=>$('#linkUrl').focus(),80);
}
$('#linkOk').addEventListener('click',()=>{
  const url=$('#linkUrl').value.trim();if(!url)return toast('Введите URL','warn');
  const txt=$('#linkTxt').value.trim();const st=$('#linkStyle').value;
  closeModal('linkModal');
  if(st==='chip'){insertChip(txt||url,url,integ('panax'))}else insertLink(txt,url);
});
$('#linkUrl').addEventListener('keydown',e=>{if(e.key==='Enter')$('#linkOk').click()});

/* ==========================================================================
   НАСТРОЙКИ
   ========================================================================== */
let setTab='gen';
const ICONS=['🎮','🕹️','♨️','🛠️','▶️','🟡','📊','⏱️','🏆','🎯','🧩','📺','🌐','⭐','🔥','👾','💾','🗂️'];
function openSettings(tab){setTab=tab||'gen';$$('#setModal .tab').forEach(t=>t.classList.toggle('on',t.dataset.st===setTab));renderSettings();$('#setModal').classList.add('on')}
$$('#setModal .tab').forEach(t=>t.addEventListener('click',()=>{setTab=t.dataset.st;$$('#setModal .tab').forEach(x=>x.classList.toggle('on',x===t));renderSettings()}));
function renderSettings(){
  const b=$('#setBody');
  if(setTab==='gen'){
    const curTheme = (document.documentElement.getAttribute('data-gq-theme') || (state.settings && state.settings.theme) || 'panax-dark');
    b.innerHTML=`<div class="field"><label>Имя автора (подпись в обзоре и в Markdown)</label><input class="inp" id="stAuthor" value="${esc(state.settings.author||'')}"></div>
      <div class="field"><label>Тема оформления</label>
        <select class="inp" id="stTheme">
          ${gqThemeList().map(th=>`<option value="${esc(th.id)}"${curTheme===th.id?' selected':''}>${esc(th.name)}</option>`).join('')}
        </select>
        <div style="font-size:12px;color:var(--mut);margin-top:6px">Запоминается для этого браузера. Меняет палитру редактора и стандартных виджетов (кроме кастомных карточек игр).</div>
      </div>
      <div class="field"><label>Поведение редактора</label>
        <div class="intg"><div class="ei">💾</div><div class="nm"><b>Автосохранение</b><span>обзоры хранятся локально в браузере</span></div><div class="tg on"></div></div>
        <div class="intg" data-t="ai"><div class="ei">✨</div><div class="nm"><b>ИИ-поиск игр</b><span>подбирать обложки и описания автоматически (заглушка — новые интеграции добавит ИИ)</span></div><div class="tg ${state.settings.aiSearch?'on':''}"></div></div>
      </div>
      <div class="field"><label>Горячие клавиши</label>
        <div style="font-size:12px;color:var(--mut);line-height:2">
          <b>Ctrl+B / I / U</b> — жирный, курсив, подчёркнутый<br>
          <b>Ctrl+K</b> — ссылка · <b>Ctrl+Shift+G</b> — поиск игры<br>
          <b>Ctrl+S</b> — сохранить · <b>Enter</b> — новый блок · <b>Shift+Enter</b> — перенос строки<br>
          <b>Ctrl+Shift+E</b> — меню экспорта
        </div></div>`;
    $('#stAuthor').addEventListener('input',e=>{state.settings.author=e.target.value;save(true);updateMeta()});
    const stTheme=$('#stTheme');
    if(stTheme) stTheme.addEventListener('change',e=>{
      const t=gqApplyTheme(e.target.value);
      if(GQ&&GQ.setTheme) GQ.setTheme(t);
      save(true);
      const info=gqThemeList().find(x=>x.id===t);
      toast('Тема: '+(info?info.name:t),'ok');
    });
    b.querySelector('[data-t="ai"]').addEventListener('click',()=>{state.settings.aiSearch=!state.settings.aiSearch;save(true);renderSettings();
      toast(state.settings.aiSearch?'ИИ-поиск включён (демо)':'ИИ-поиск выключен',state.settings.aiSearch?'ok':'warn')});
    return;
  }
  if(setTab==='int'){
    b.innerHTML=`<div class="pop-h" style="padding:0 0 8px">Подключённые игровые сервисы</div>
      ${state.settings.integrations.map((s,i)=>`<div class="intg" data-i="${i}">
        <div class="ei">${esc(s.icon)}</div>
        <div class="nm"><b>${esc(s.name)}</b><span>${esc(s.base)} ${s.ai?'· ✨ добавлено ИИ':''}</span></div>
        <button class="ghost" data-e="${i}" style="padding:5px 9px;font-size:11px">✎</button>
        <button class="ghost" data-x="${i}" style="padding:5px 9px;font-size:11px;color:var(--red)">✕</button>
        <div class="tg ${s.enabled?'on':''}" data-t="${i}"></div></div>`).join('')}
      <div class="pop-sep" style="margin:14px 0"></div>
      <div class="pop-h" style="padding:0 0 8px">Добавить интеграцию</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="field"><label>Название</label><input class="inp" id="niName" placeholder="Например, OpenCritic"></div>
        <div class="field"><label>Базовый URL</label><input class="inp" id="niBase" placeholder="https://opencritic.com"></div></div>
      <div class="field"><label>Иконка</label><div class="iconbar" id="niIcons">${ICONS.map((ic,i)=>`<button data-ic="${ic}" class="${i===0?'on':''}">${ic}</button>`).join('')}</div></div>
      <div class="field"><label>Цвет</label><input class="inp" id="niColor" type="color" value="#7c5cff" style="height:40px;padding:4px"></div>
      <button class="pri" id="niAdd">＋ Подключить сервис</button>
      <div style="font-size:11px;color:var(--dim);margin-top:10px">✨ Позже ИИ сможет добавлять сюда новые интеграции автоматически — список открыт для расширения.</div>`;
    let pickedIcon=ICONS[0];
    $$('#niIcons button').forEach(x=>x.addEventListener('click',()=>{pickedIcon=x.dataset.ic;$$('#niIcons button').forEach(y=>y.classList.toggle('on',y===x))}));
    $('#niAdd').addEventListener('click',()=>{
      const n=$('#niName').value.trim(),bs=$('#niBase').value.trim();
      if(!n)return toast('Введите название','warn');
      state.settings.integrations.push({id:n.toLowerCase().replace(/\s+/g,'-')+'-'+uid().slice(0,3),name:n,icon:pickedIcon,color:$('#niColor').value||'#7c5cff',base:bs,enabled:true,ai:true});
      save(true);renderSettings();toast('Интеграция «'+n+'» добавлена ✨','ok')});
    b.addEventListener('click',e=>{
      const t=e.target.closest('[data-t]');
      if(t){const s=state.settings.integrations[+t.dataset.t];s.enabled=!s.enabled;save(true);renderSettings();return}
      const x=e.target.closest('[data-x]');
      if(x){const i=+x.dataset.x;const s=state.settings.integrations[i];
        if(confirm('Отключить интеграцию «'+s.name+'»?')){state.settings.integrations.splice(i,1);save(true);renderSettings();toast('Интеграция удалена','warn')}return}
      const ed=e.target.closest('[data-e]');
      if(ed){const s=state.settings.integrations[+ed.dataset.e];const n=prompt('Название сервиса:',s.name);if(n){s.name=n;save(true);renderSettings()}}
    });
    return;
  }
  if(setTab==='data'){
    b.innerHTML=`<div class="pop-h" style="padding:0 0 8px">Обзоры: ${state.reviews.length}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px">
        <button class="ins-b" data-d="md"><span class="e">📝</span><span>Все обзоры в Markdown<small>то, что конвертируется</small></span></button>
        <button class="ins-b" data-d="gq"><span class="e">💠</span><span>Все обзоры в формате GameQuill<small>без потерь: дизайн + форматирование</small></span></button>
        <button class="ins-b" data-d="imp"><span class="e">⬆️</span><span>Импорт файла .gq / .json<small>восстановить обзоры</small></span></button>
        <button class="ins-b" data-d="clr"><span class="e">🗑</span><span>Удалить все обзоры<small>необратимо</small></span></button>
      </div>
      <div class="pop-sep" style="margin:16px 0"></div>
      <div style="font-size:12px;color:var(--mut);line-height:1.8">
        <b style="color:var(--txt)">Про экспорт:</b><br>
        📝 <b>Markdown</b> — переносится разметка текста (жирный, курсив, зачёркнутый, код, маркер, ссылки, списки, цитаты, разделители). Подчёркивание, цвет текста, виджеты игр и звёздные оценки передаются текстом/таблицами — то, что Markdown не поддерживает, остаётся читаемым чистым текстом.<br>
        💠 <b>Формат GameQuill (.gq)</b> — полный JSON-снимок: все блоки, виджеты, оценки, аспекты, плюсы/минусы, цвет и дизайн. При импорте в этот же редактор ничего не теряется.
      </div>`;
    b.addEventListener('click',e=>{
      const d=e.target.closest('[data-d]');if(!d)return;const k=d.dataset.d;
      if(k==='md')download(allMd(),'GameQuill-все-обзоры.md','md');
      if(k==='gq')downloadGQ(true);
      if(k==='imp'){closeModal('setModal');$('#fileIn').click()}
      if(k==='clr'&&confirm('Удалить ВСЕ обзоры? Это необратимо.')){state.reviews=[];state.currentId=null;save(true);renderSidebar();renderEditor();closeModal('setModal');toast('Все обзоры удалены','warn')}
    });
  }
}
function closeModal(id){$('#'+id).classList.remove('on')}
$$('[data-close]').forEach(b=>b.addEventListener('click',()=>{b.closest('.mv').classList.remove('on')}));
$$('.mv').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('on')}));
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){$$('.mv.on').forEach(m=>m.classList.remove('on'));$('#blockMenu').classList.remove('on');$('#expMenu').classList.remove('on');$('#flt').classList.remove('on')}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();toast('Сохранено 💾','ok')}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openLink(false)}
  if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='g'){e.preventDefault();openInsert('game',{})}
  if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='e'){e.preventDefault();openExpMenu($('[data-a="exp-menu"]')||$('.rb-tab'))}
});

/* ==========================================================================
   ЭКСПОРТ
   ========================================================================== */
function openExpMenu(anchor){
  const m=$('#expMenu');
  m.innerHTML=`<div class="pop-h">Экспорт обзора</div>
   <button class="pop-i" data-e="md"><span class="e">📝</span><span>Markdown — этот обзор<small>файл .md</small></span></button>
   <button class="pop-i" data-e="gq"><span class="e">💠</span><span>Формат GameQuill — этот обзор<small>файл .gq, без потерь</small></span></button>
   <button class="pop-i" data-e="cmd"><span class="e">📋</span><span>Скопировать Markdown<small>в буфер обмена</small></span></button>
   <div class="pop-sep"></div><div class="pop-h">Все обзоры (${state.reviews.length})</div>
   <button class="pop-i" data-e="mdall"><span class="e">📚</span><span>Markdown — все обзоры<small>один файл .md</small></span></button>
   <button class="pop-i" data-e="gqall"><span class="e">🗃</span><span>GameQuill — все обзоры<small>архив .gq для переноса</small></span></button>`;
  const r=(anchor&&anchor.getBoundingClientRect())||{left:100,bottom:100};
  m.style.left=Math.min(r.left,innerWidth-250)+'px';m.style.top=(r.bottom+6)+'px';m.classList.add('on');
  m.onclick=e=>{const it=e.target.closest('[data-e]');if(!it)return;m.classList.remove('on');
    const k=it.dataset.e;
    if(k==='md')download(reviewToMd(cur()),fileName(cur())+'.md');
    if(k==='gq')downloadGQ(false);
    if(k==='cmd')copyMd();
    if(k==='mdall')download(allMd(),'GameQuill-все-обзоры.md');
    if(k==='gqall')downloadGQ(true)};
}
function fileName(r){const s=(r.title||r.game||'обзор').replace(/[\\/:*?"<>|]+/g,'').trim().slice(0,60);return s||'обзор'}
function download(text,name){const blob=new Blob([text],{type:'text/plain;charset=utf-8'});const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);toast('Файл сохранён: '+name,'ok')}
function downloadGQ(all){
  const payload={app:'GameQuill',format:'gq-native',version:2,exportedAt:new Date().toISOString(),author:state.settings.author,
    integrations:state.settings.integrations,reviews:all?state.reviews:[cur()].filter(Boolean)};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=all?'GameQuill-все-обзоры.gq':'GameQuill-'+fileName(cur()||{})+'.gq';a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1500);
  toast('Экспорт в родной формат GameQuill — ничего не потеряно 💠','ok');
}
function copyMd(){const t=reviewToMd(cur());navigator.clipboard.writeText(t).then(()=>toast('Markdown скопирован в буфер 📋','ok'),()=>toast('Не удалось скопировать','err'))}

/* --- HTML → Markdown --- */
function inlineMd(root){
  let out='';
  const walk=n=>{
    n.childNodes.forEach(ch=>{
      if(ch.nodeType===3){out+=ch.nodeValue.replace(/\s+/g,' ');return}
      if(ch.nodeType!==1)return;
      const t=ch.tagName;const inner=()=>{const s=out;out='';walk(ch);const r=out;out=s;return r};
      const wrap=(p,txt)=>{const s=txt.trim();return s?p+s+p:''};
      if(t==='BR')out+='\n';
      else if(t==='B'||t==='STRONG')out+=wrap('**',inner());
      else if(t==='I'||t==='EM')out+=wrap('*',inner());
      else if(t==='U')out+=inner();
      else if(t==='S'||t==='STRIKE'||t==='DEL')out+=wrap('~~',inner());
      else if(t==='CODE')out+=wrap('`',inner());
      else if(t==='MARK')out+=wrap('==',inner());
      else if(t==='FONT')out+=inner();
      else if(t==='A'){const href=ch.getAttribute('href')||'';const txt=inner().trim()||href;
        out+=ch.classList.contains('game-chip')?`[🎮 ${txt}](${href})`:`[${txt}](${href})`}
      else if(t==='UL'){const s=out;out='';ch.querySelectorAll(':scope>li').forEach(li=>{out+='\n- '+inlineMd(li)});out=s+out.trim()+'\n'}
      else if(t==='OL'){const s=out;out='';let i=1;ch.querySelectorAll(':scope>li').forEach(li=>{out+='\n'+(i++)+'. '+inlineMd(li)});out=s+out.trim()+'\n'}
      else if(t==='P'||t==='DIV'||t==='H1'||t==='H2'||t==='H3'||t==='H4'){const s=out;out='';walk(ch);out=s+(s&&!s.endsWith('\n')?'\n':'')+out.trim()+'\n'}
      else out+=inner();
    });
  };
  walk(root);
  return out.replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
function toMd(html){const d=document.createElement('div');d.innerHTML=html||'';return inlineMd(d)}
function starsMd(n){return n>0?'★'.repeat(n)+'☆'.repeat(10-n):'☆☆☆☆☆☆☆☆☆☆'}
function blockMd(b){
  switch(b.type){
    case 'h2':return '## '+toMd(b.html);
    case 'h3':return '### '+toMd(b.html);
    case 'quote':return toMd(b.html).split('\n').map(l=>'> '+l).join('\n');
    case 'spoiler':return '> **⚠️ СПОЙЛЕР**\n>\n'+toMd(b.html).split('\n').map(l=>'> '+l).join('\n');
    case 'divider':return '---';
    case 'text':return toMd(b.html);
    case 'game':{const d=b.data||{};
      const srcs=Object.keys(d.links||{}).map(k=>{const s=integ(k);return s?`[${s.icon} ${s.name}](${d.links[k]})`:null}).filter(Boolean);
      const rt=Object.keys(d.ratings||{}).map(k=>{const s=integ(k);return s?`${s.name}: **${d.ratings[k]}**`:null}).filter(Boolean);
      return [`> ### 🎮 ${d.title||'Игра'}`,
        `> ${[d.year,d.dev,d.pub].filter(Boolean).join(' · ')}`,
        (d.genres||[]).length?`> Жанры: ${d.genres.join(', ')}`:'',
        rt.length?`> Оценки: ${rt.join(' · ')}`:'',
        srcs.length?`> Страницы: ${srcs.join(' | ')}`:''].filter(Boolean).join('\n')};
    case 'steam':{const d=b.data||{};
      return [`> ### ♨️ ${d.title} — в Steam`,
        d.tags&&d.tags.length?`> Теги: ${d.tags.join(', ')}`:'',
        d.date?`> Дата выхода: ${d.date}`:'',
        `> Цена: **${d.price||'не указана'}**${d.disc?` (${d.disc}${d.old?', было '+d.old:''})`:''}`,
        d.url?`> [Открыть в Steam](${d.url})`:''].filter(Boolean).join('\n')};
    case 'youtube':{const d=b.data||{};
      return [`> ### ▶️ ${d.title}`,`> Канал: ${d.channel||'YouTube'}${d.dur?' · длительность '+d.dur:''}`,d.url?`> [Смотреть видео](${d.url})`:''].filter(Boolean).join('\n')};
    case 'workshop':{const d=b.data||{};
      return [`> ### 🛠️ ${d.title}`,`> Мастерская Steam · автор: ${d.author||'—'}${d.subs?' · подписчиков: '+d.subs:''}${d.game?' · игра: '+d.game:''}`,d.url?`> [Открыть предмет](${d.url})`:''].filter(Boolean).join('\n')};
    default:return '';
  }
}
function reviewToMd(r){
  if(!r)return '';
  const L=[];
  if(r.title)L.push('# '+r.title,'');
  if(r.game)L.push('**Игра:** '+r.game,'');
  const sc=SCORES[r.score];
  if(r.score>0&&sc)L.push(`**Оценка:** ${r.score}/10 \`${starsMd(r.score)}\` — «${sc.t}» ${sc.i}`,`> ${sc.d}`,'');
  else L.push('**Оценка:** не выставлена','');
  const v=VERDICT[r.recommend]||VERDICT.none;
  L.push(`**Вердикт:** ${v.e} ${v.t}`,'');
  if(r.aspects&&r.aspects.length){
    L.push('## Оценки аспектов','');
    L.push('| Аспект | Оценка | Примечание |');L.push('| --- | :---: | --- |');
    r.aspects.forEach(a=>{
      if(a.score>0)L.push(`| ${a.name} | \`${starsMd(a.score).slice(0,10)}\` ${a.score}/10 | |`);
      else L.push(`| ${a.name} | — | ${UNRATED[a.unrated]||UNRATED.unsure} |`)});
    L.push('');
  }
  if(r.blocks&&r.blocks.length){L.push('## Обзор','');r.blocks.forEach(b=>{const md=blockMd(b);if(md)L.push(md,'')})}
  const pros=(r.pros||[]).filter(p=>p.text&&p.text.trim());
  const cons=(r.cons||[]).filter(c=>c.text&&c.text.trim());
  if(pros.length){L.push('## ✅ Плюсы','');pros.forEach(p=>L.push('- '+p.text.trim()));L.push('')}
  if(cons.length){L.push('## ❌ Минусы','');cons.forEach(c=>L.push('- '+c.text.trim()));L.push('')}
  L.push('---');
  L.push(`*Обзор написан в GameQuill${state.settings.author?' · автор: '+state.settings.author:''} · ${new Date(r.updatedAt||Date.now()).toLocaleDateString('ru-RU')}*`);
  return L.join('\n').replace(/\n{3,}/g,'\n\n');
}
function currentMd(){return reviewToMd(cur())}
function allMd(){
  const head=`# Мои обзоры игр — GameQuill\n\n> Экспортировано: ${new Date().toLocaleString('ru-RU')} · обзоров: ${state.reviews.length}\n\n## Содержание\n\n`+
   state.reviews.map((r,i)=>`${i+1}. **${r.title||'Без названия'}**${r.game?' — '+r.game:''}${r.score>0?' · '+r.score+'/10 '+SCORES[r.score].i:''}`).join('\n')+'\n\n';
  return head+state.reviews.map(r=>'\n\n---\n\n'+reviewToMd(r)).join('');
}

/* ---------- импорт ---------- */
$('#fileIn').addEventListener('change',e=>{
  const f=e.target.files[0];if(!f)return;const rd=new FileReader();
  rd.onload=()=>{try{
    const p=JSON.parse(rd.result);
    let incoming=[];
    if(p.app==='GameQuill'&&p.reviews)incoming=p.reviews;
    else if(Array.isArray(p))incoming=p;
    else if(p.id&&p.blocks)incoming=[p];
    else if(p.review)incoming=[p.review];
    else throw new Error('bad');
    if(p.integrations&&Array.isArray(p.integrations)){
      p.integrations.map(GQ.cleanInteg).filter(Boolean).forEach(ni=>{if(!state.settings.integrations.some(x=>x.id===ni.id))state.settings.integrations.push(ni)})}
    let added=0;
    incoming=incoming.map(x=>GQ.toEditorReview(x)).filter(Boolean);
    incoming.forEach(rv=>{
      if(!rv||typeof rv!=='object')return;
      rv.id=uid();rv.title=rv.title||'';rv.blocks=rv.blocks||[];rv.pros=rv.pros||[];rv.cons=rv.cons||[];
      rv.aspects=rv.aspects||[];rv.score=rv.score||0;rv.recommend=rv.recommend||'none';rv.createdAt=rv.createdAt||Date.now();rv.updatedAt=Date.now();
      state.reviews.unshift(rv);added++;
      if(added===1)state.currentId=rv.id;
    });
    save(true);renderSidebar();renderEditor();toast('Импортировано обзоров: '+added+' 💠','ok');
  }catch(err){toast('Файл не похож на экспорт GameQuill','err')}
  e.target.value=''};
  rd.readAsText(f);
});

/* ==========================================================================
   САНИТАЙЗЕР
   ========================================================================== */
const OK={B:1,STRONG:1,I:1,EM:1,U:1,S:1,STRIKE:1,DEL:1,CODE:1,MARK:1,A:1,BR:1,SPAN:1,FONT:1,P:1,DIV:1,UL:1,OL:1,LI:1,BLOCKQUOTE:1,H1:1,H2:1,H3:1,H4:1,SUB:1,SUP:1};
function sanitize(html,inlineOnly){
  const src=document.createElement('div');src.innerHTML=html;const dst=document.createElement('div');
  const walk=(from,to)=>{
    from.childNodes.forEach(n=>{
      if(n.nodeType===3){to.appendChild(document.createTextNode(n.nodeValue));return}
      if(n.nodeType!==1)return;
      const t=n.tagName;
      if(!OK[t]){walk(n,to);return}
      if(inlineOnly&&(t==='P'||t==='DIV')){if(to.childNodes.length)to.appendChild(document.createElement('br'));walk(n,to);return}
      const el=document.createElement(t);
      if(t==='A'){const h=n.getAttribute('href')||'';if(/^(https?:|mailto:|#)/i.test(h))el.setAttribute('href',h);
        el.setAttribute('target','_blank');el.setAttribute('rel','noopener');
        if(n.classList.contains('game-chip'))el.className='game-chip'}
      if(t==='SPAN'||t==='FONT'){const st=(n.getAttribute('style')||'').split(';').filter(x=>/^\s*(color|background(-color)?|font-size|font-weight)\s*:/i.test(x)).join(';');
        if(st)el.setAttribute('style',st)}
      walk(n,el);to.appendChild(el);
    });
  };
  walk(src,dst);return dst.innerHTML;
}

/* ==========================================================================
   ЛЕНТА: вкладки, кнопки
   ========================================================================== */
$$('.rb-tab').forEach(t=>t.addEventListener('click',()=>{
  $$('.rb-tab').forEach(x=>x.classList.toggle('on',x===t));
  $$('.rb-pane').forEach(p=>p.classList.toggle('on',p.dataset.pane===t.dataset.pane));
}));
/* кнопка "Экспорт" в сайдбаре */
$('#btnExportAll').addEventListener('click',e=>{e.stopPropagation();openExpMenu(e.currentTarget)});
$('#btnImport').addEventListener('click',()=>$('#fileIn').click());
$('#btnSettings').addEventListener('click',()=>openSettings());
$('#btnNew').addEventListener('click',()=>newReview());
$('#wNew').addEventListener('click',()=>newReview());
$('#wDemo').addEventListener('click',()=>seedDemo(true));
$('#sbToggle').addEventListener('click',()=>$('#sidebar').classList.toggle('hide'));
$('#docTitle').addEventListener('input',e=>{const r=cur();if(!r)return;r.title=e.target.value;touch()});
$('#docGame').addEventListener('input',e=>{const r=cur();if(!r)return;r.game=e.target.value;touch()});

/* ==========================================================================
   ДЕМО-ОБЗОР
   ========================================================================== */
function seedDemo(replace){
  const g=DEMO_GAMES[0];
  const r=makeReview();
  r.title='Неоновый реквием по человечеству';
  r.game=g.title;
  r.score=8;r.recommend='yes';
  r.aspects=[
    {id:uid(),name:'Сюжет',score:9,unrated:'unsure'},
    {id:uid(),name:'Графика',score:10,unrated:'unsure'},
    {id:uid(),name:'Геймплей',score:8,unrated:'unsure'},
    {id:uid(),name:'Оптимизация',score:0,unrated:'unsure'},
    {id:uid(),name:'Локализация',score:7,unrated:'unsure'},
    {id:uid(),name:'Реиграбельность',score:0,unrated:'na'}
  ];
  r.blocks=[
    {id:uid(),type:'game',data:gameData(g)},
    {id:uid(),type:'text',html:'<b>Neon Requiem</b> — это тот редкий случай, когда экшен от первого лица не пытается быть всем сразу. Первые два часа игра буквально <mark>берёт вас за шкирку</mark> и тащит сквозь неоновые трущобы, не давая ни секунды на передышку.'},
    {id:uid(),type:'h2',html:'Сюжет без спойлеров'},
    {id:uid(),type:'text',html:'История наёмницы Вексы подана через <u>короткие брифинги</u> и диалоги в пути — ни одного ролика дольше двух минут. Сценарий держит интригу до финала, а финал, к слову, <i>зависит от трёх ваших решений</i>.'},
    {id:uid(),type:'quote',html:'«Город не спасают. В нём просто выбирают, кто выживет.» — Векса, третий акт'},
    {id:uid(),type:'h3',html:'Геймплей и импланты'},
    {id:uid(),type:'text',html:'Боевая система строится вокруг <code>переключения имплантов</code> на лету: рывок, замедление времени, взлом турелей. Комбо собираются интуитивно, а сложность честно растёт.'},
    {id:uid(),type:'spoiler',html:'Финальный поворот с двойником Вексы полностью меняет мотивацию антагониста — и именно за это игре можно простить слабый третий акт.',hidden:true},
    {id:uid(),type:'divider',data:{style:1}},
    {id:uid(),type:'youtube',data:ytData(g)},
    {id:uid(),type:'h2',html:'Техническая часть'},
    {id:uid(),type:'steam',data:steamData(g)},
    {id:uid(),type:'text',html:'На релизе игра <s>работала идеально</s> проседала до 45 FPS в центре города, но патч 1.0.3 почти всё починил. Полное прохождение заняло у меня <b>34 часа</b>.'},
    {id:uid(),type:'workshop',data:{title:g.ws[0].t,author:g.ws[0].a,subs:g.ws[0].s,game:g.title,url:'https://steamcommunity.com/sharedfiles/filedetails/?id=299411220',cover:g.cover}},
    {id:uid(),type:'h2',html:'Итог'},
    {id:uid(),type:'text',html:'Neon Requiem — лучший киберпанк-экшен со времён жанрового ренессанса. Берите, если любите <a class="lnk" href="https://www.backloggd.com/games/neon-requiem/" target="_blank" rel="noopener">сюжетные песочницы</a> и готовы простить мелкие технические огрехи ради потрясающей атмосферы.'}
  ];
  r.pros=[{id:uid(),text:'Невероятный арт-дизайн и работа со светом'},{id:uid(),text:'Боевая система с имплантами — лучшая в жанре'},
    {id:uid(),text:'Живой город, который реагирует на ваши действия'},{id:uid(),text:'Полная русская локализация с отличной озвучкой'}];
  r.cons=[{id:uid(),text:'Просадки FPS в центре Нео-Киото на релизе'},{id:uid(),text:'Слабый третий акт и скомканный финал побочек'},
    {id:uid(),text:'Нет фоторежима из коробки — только мод в Мастерской'}];
  if(replace){state.reviews.unshift(r);state.currentId=r.id}
  else{state.reviews.push(r);if(!state.currentId)state.currentId=r.id}
  save(true);renderSidebar();renderEditor();toast('Загружен пример обзора ✨','ok');
}

/* ==========================================================================
   СТАРТ
   ========================================================================== */
function boot(){
  load();
  if(!state.reviews.length){const r0=makeReview();state.reviews.push(r0);state.currentId=r0.id}
  if(!state.currentId&&state.reviews.length)state.currentId=state.reviews[0].id;
  renderSidebar();renderEditor();renderWelcome();
  if(innerWidth<980)$('#sidebar').classList.add('hide');
  setInterval(()=>{if(cur())save(true)},20000);
}
/* boot() вызывается из panax-bridge в конце файла */

/* ==========================================================================
   PANAX RU: мост к странице поста (iframe), реальный поиск Steam
   ========================================================================== */
function cssUrl(u){return String(u||'').replace(/[\\'"()\s<>]/g,c=>encodeURIComponent(c))}
const gqEnv={steamCountry:'KZ',postId:null,mode:'new'};

/* --- поиск игр: Steam storesearch вместо мок-базы --- */
function redrawIns(){
  if(!$('#insModal').classList.contains('on'))return;
  if(insCtx.tab==='game'){drawGames();drawDetail()}
  else if(insCtx.tab==='youtube')drawYT();
  else if(insCtx.tab==='steam')drawSteam();
  else if(insCtx.tab==='workshop')drawWS();
}
let gqSearchSeq=0;
const gqSearch=debounce(async q=>{
  q=(q||'').trim();const seq=++gqSearchSeq;
  if(q.length<2){GAMES=[];redrawIns();return}
  try{const res=await GQ.steamSearch(q,gqEnv.steamCountry);if(seq!==gqSearchSeq)return;GAMES=res;redrawIns()}
  catch(e){if(seq===gqSearchSeq)toast('Поиск Steam недоступен: '+(e&&e.message||e),'err')}
},150);
document.addEventListener('input',e=>{if(e.target&&e.target.id==='insQ')gqSearch(e.target.value)});

const _gqDrawGames=drawGames;
drawGames=function(){
  _gqDrawGames();
  if(!GAMES.length&&!panaxResults.length){const box=$('#gRes');if(box)box.innerHTML=`<div class="empty" style="grid-column:1/-1"><div class="big">🔍</div>${(insCtx.q||'').trim().length<2?'Введите название игры для поиска в Steam':'Ничего не найдено'}<br><small>Свою ссылку можно вставить во вкладке «По ссылке»</small></div>`}
};
const _gqEmptyHint=sel=>{const box=$(sel);if(box&&!GAMES.length)box.innerHTML=`<div class="empty">${(insCtx.q||'').trim().length<2?'Введите название игры для поиска в Steam':'Ничего не найдено'}</div>`};
const _gqDrawYT=drawYT;drawYT=function(){_gqDrawYT();_gqEmptyHint('#ytList')};
const _gqDrawSteam=drawSteam;drawSteam=function(){_gqDrawSteam();_gqEmptyHint('#stList')};
const _gqDrawWS=drawWS;drawWS=function(){_gqDrawWS();_gqEmptyHint('#wsList')};

const _gqDrawDetail=drawDetail;
drawDetail=function(){
  _gqDrawDetail();
  const g=findSelectedGame(insCtx.sel);
  if(g&&!g._full&&!g._loading&&g.steam&&g.steam.app){
    g._loading=true;
    GQ.steamDetails(g.steam.app,gqEnv.steamCountry).then(d=>{g._full=true;g._loading=false;if(d)GQ.mergeDetails(g,d);if(insCtx.sel===g.id){_gqDrawDetail();drawGames()}})
      .catch(()=>{g._full=true;g._loading=false});
  }
};

const _gqCommit=commit;
commit=function(type,data){
  data=Object.assign({},data||{});
  if(type==='youtube'&&!data.cover)data.cover=GQ.ytCover(data.url);
  if(type==='steam'){
    if(!data.app){const m=/\/app\/(\d+)/.exec(data.url||'');if(m)data.app=m[1]}
    if(data.app&&!data.url)data.url='https://store.steampowered.com/app/'+data.app+'/';
    if(data.app&&!data.cover)data.cover=GQ.steamCover(data.app);
  }
  const b=_gqCommit(type,data);
  if(type==='steam'&&data.app&&!data.price){
    const app=data.app;
    GQ.steamDetails(app,gqEnv.steamCountry).then(d=>{if(!d)return;const r=cur();if(!r)return;
      const blk=r.blocks.find(x=>x.type==='steam'&&x.data&&x.data.app===app&&!x.data.price);if(!blk)return;
      Object.assign(blk.data,GQ.steamWidgetPatch(d));touch();renderBlocks()}).catch(()=>{});
  }
  if(type==='game'&&b&&b.data&&!DEMO_GAME_IDS.has(b.data.gameId)&&rxSum(b.data.panaxReactions)===0&&window.GQ&&typeof GQ.panaxResolveGame==='function'){
    b._panaxHydrating=true;
    GQ.panaxResolveGame(b.data).then(det=>{
      if(applyPanaxPatch(b.data,det)){touch();renderBlocks()}
    }).catch(()=>{});
  }
  return b;
};

/* --- безопасная вставка из буфера: общий allow-list санитайзер --- */
sanitize=function(html,inlineOnly){return GQ.sanitizeHtml(html)};

/* --- перенос в пост --- */
async function gqTransfer(){
  const r=cur();if(!r)return toast('Нет открытого обзора','warn');
  if(!GQ.hasContent(r))return toast('Обзор пустой — нечего переносить','warn');
  const btn=$('#gqSend');btn.disabled=true;
  try{
    const res=await GQ.exportForPost(r,state.settings);
    if(gqEnv.postId)r.panaxPostId=gqEnv.postId;
    save(true);
    GQ.post({type:'gq:transfer',reviewId:r.id,ops:res.ops,plain:res.plain,html:res.html,carrier:res.carrierText,fp:res.fp,sizes:res.sizes,doc:res.doc||null});
  }catch(e){
    toast(e&&e.code==='too-large'?'Обзор слишком большой для поста (лимит ~48 КБ в сжатом виде) — сократите текст':e&&e.code==='empty'?'Обзор пустой — нечего переносить':'Ошибка переноса: '+(e&&e.message||e),'err');
  }finally{btn.disabled=false}
}
$('#gqSend').addEventListener('click',gqTransfer);
$('#gqClose').addEventListener('click',()=>{save(true);GQ.post({type:'gq:close'})});

GQ.onMessage(m=>{
  if(!m||typeof m!=='object')return;
  if(m.type==='gq:init'){
    gqEnv.steamCountry=/^[A-Z]{2}$/.test(m.steamCountry||'')?m.steamCountry:'KZ';
    gqEnv.postId=m.postId?String(m.postId).slice(0,80)||null:null;
    gqEnv.mode=m.mode==='edit'?'edit':'new';
    const gameTitle=typeof m.gameTitle==='string'?m.gameTitle.trim().slice(0,200):'';
    if(gqEnv.postId){const ex=state.reviews.find(x=>x.panaxPostId===gqEnv.postId);if(ex&&state.currentId!==ex.id){state.currentId=ex.id;renderSidebar();renderEditor()}}
    const r=cur();
    if(gameTitle&&r&&!r.game&&!GQ.hasContent(r)){r.game=gameTitle;save(true);renderEditor()}
    return;
  }
  if(m.type==='gq:transfer-result'){
    if(m.ok)toast(m.message||'Обзор перенесён в поле отзыва — нажмите «Save» / «Сохранить» на сайте','ok');
    else toast(m.message||'Не удалось вставить обзор в редактор сайта','err');
    return;
  }
  if(m.type==='gq:load'&&m.doc){
    const rv=GQ.toEditorReview(m.doc);if(!rv)return toast('Не удалось прочитать оформление поста','err');
    rv.panaxPostId=gqEnv.postId;
    Object.entries(rv.integ||{}).forEach(([k,v])=>{if(!state.settings.integrations.some(x=>x.id===k)){const ni=GQ.cleanInteg({id:k,name:v.name,icon:v.icon,color:v.color,enabled:true});if(ni)state.settings.integrations.push(ni)}});
    delete rv.integ;
    const ex=rv.panaxPostId?state.reviews.find(x=>x.panaxPostId===rv.panaxPostId):null;
    if(ex&&m.soft){state.currentId=ex.id;save(true);renderSidebar();renderEditor();return}
    if(ex){
      if(ex.updatedAt>rv.updatedAt&&!confirm('У вас есть более новый локальный черновик этого поста. Заменить его версией из опубликованного поста?')){state.currentId=ex.id;renderSidebar();renderEditor();return}
      Object.assign(ex,rv,{id:ex.id,createdAt:ex.createdAt});state.currentId=ex.id;
    }else{state.reviews.unshift(rv);state.currentId=rv.id}
    save(true);renderSidebar();renderEditor();toast('Оформление поста загружено в редактор','ok');
  }
});


/* --- тестовый обзор (только по кнопке, с подтверждением) + изображения --- */
if (typeof INS_TABS !== 'undefined' && !INS_TABS.some(t => t.id === 'image')) {
  INS_TABS.push({ id: 'image', n: '🖼 Фото' });
}
if (typeof BMENU !== 'undefined' && !BMENU.some(t => t.t === 'ins:image')) {
  const i = BMENU.findIndex(x => x.sep);
  const item = { t: 'ins:image', e: '🖼', n: 'Изображение', d: 'с компьютера или по URL' };
  if (i >= 0) BMENU.splice(i + 1, 0, item);
  else BMENU.push(item);
}
(function relabelDemoBtns() {
  const em = document.querySelector('[data-a="demo"] em');
  if (em) em.textContent = 'Вставить тестовый обзор';
  const btn = document.querySelector('[data-a="demo"]');
  if (btn) btn.title = 'Вставить готовый тестовый обзор «Неоновый реквием по человечеству»';
  const w = $('#wDemo');
  if (w) w.textContent = '✨ Вставить тестовый обзор';
  const widgets = document.querySelector('[data-pane="insert"] .rg:nth-child(2) .rg-b');
  if (widgets && !widgets.querySelector('[data-v="image"]')) {
    const b = document.createElement('button');
    b.className = 'rb-btn big';
    b.dataset.a = 'insert';
    b.dataset.v = 'image';
    b.innerHTML = '<span>🖼</span><em>Изображение</em>';
    widgets.appendChild(b);
    const lab = widgets.parentElement.querySelector('.rg-l');
    if (lab) lab.textContent = 'Виджеты и фото';
  }
})();

seedDemo = function () {
  let r = cur();
  if (!r) {
    r = makeReview();
    state.reviews.unshift(r);
    state.currentId = r.id;
  }
  if (GQ.hasContent(r) && !confirm(GQ.DEMO_CONFIRM)) return;
  const g = (typeof DEMO_GAMES !== 'undefined' && DEMO_GAMES[0]) || GQ.DEMO_GAME;
  const cover = (typeof coverArt === 'function') ? coverArt(g.id, g.title, g.pal) : '';
  GQ.applyDemoReview(r, { uid, cover, game: g });
  save(true);
  renderSidebar();
  renderEditor();
  toast('Вставлен тестовый обзор ✨', 'ok');
};

const _gqWidgetHTML = widgetHTML;
function galleryItems(d) {
  if (Array.isArray(d && d.items) && d.items.length) return d.items;
  if (d && d.url) return [d];
  return [];
}
widgetHTML = function (b) {
  if (b.type === 'image') {
    const d = b.data || {};
    const items = galleryItems(d);
    const tools = `<div class="w-tools"><button class="wt" data-act="edit" title="Изменить">✎</button><button class="wt x" data-act="del" title="Удалить">✕</button></div>`;
    if (!items.length) return `<div class="w w-img">${tools}<div class="empty">Нет изображения</div></div>`;
    const cells = items.map((it, i) => {
      const url = GQ.userImageUrl(it.url);
      if (!url) return `<div class="cell"><div class="img-err">Нет изображения</div></div>`;
      return `<button type="button" class="cell" data-gq-lb="${i}" data-caption="${esc(it.caption || '')}"><img src="${esc(url)}" alt="${esc(it.alt || it.caption || '')}" referrerpolicy="no-referrer"><div class="img-err" hidden>Не удалось загрузить изображение</div></button>`;
    }).join('');
    const cap = d.caption ? `<div class="img-cap">${esc(d.caption)}</div>` : '';
    const note = items.some((it) => String(GQ.userImageUrl(it.url) || '').startsWith('data:'))
      ? '<div class="img-note">Есть локальные копии — без расширения в посте их не будет</div>' : '';
    return `<div class="w w-img collage c${Math.min(items.length, 10)}">${tools}<div class="collage-grid">${cells}</div>${cap}${note}</div>`;
  }
  return _gqWidgetHTML(b);
};

(function bindImgErrors() {
  function attach() {
    document.querySelectorAll('.w-img img').forEach((img) => {
      if (img.dataset.gqErrBound) return;
      img.dataset.gqErrBound = '1';
      const err = img.parentElement && img.parentElement.querySelector('.img-err');
      const show = () => { img.hidden = true; if (err) err.hidden = false; };
      img.addEventListener('error', show);
      if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) show();
    });
  }
  function bindLb() {
    document.querySelectorAll('.w-img .collage-grid').forEach((grid) => {
      if (grid.dataset.gqLb) return;
      grid.dataset.gqLb = '1';
      grid.addEventListener('click', (e) => {
        const cell = e.target.closest('[data-gq-lb]');
        if (!cell) return;
        e.preventDefault();
        const cells = [...grid.querySelectorAll('[data-gq-lb]')];
        const items = cells.map((c) => {
          const im = c.querySelector('img');
          return { url: im && im.getAttribute('src'), caption: c.getAttribute('data-caption') || (im && im.getAttribute('alt')) || '' };
        }).filter((it) => it.url);
        const fig = grid.parentElement;
        const shared = (fig && fig.querySelector('.img-cap') && fig.querySelector('.img-cap').textContent) || '';
        openEditorLightbox(items, Math.max(0, cells.indexOf(cell)), shared);
      });
    });
  }
  const hook = (name) => {
    if (typeof window[name] !== 'function') return;
    const prev = window[name];
    window[name] = function () { prev.apply(this, arguments); attach(); bindLb(); };
  };
  hook('renderBlocks'); hook('renderEditor');
  // renderBlocks may be a local function, not on window
  if (typeof renderBlocks === 'function' && renderBlocks !== window.renderBlocks) {
    const _rb = renderBlocks;
    renderBlocks = function () { _rb(); attach(); bindLb(); };
  }
  if (typeof renderEditor === 'function' && renderEditor !== window.renderEditor) {
    const _re = renderEditor;
    renderEditor = function () { _re(); attach(); bindLb(); };
  }
  document.addEventListener('DOMContentLoaded', () => { attach(); bindLb(); });
})();

function openEditorLightbox(items, start, shared) {
  closeEditorLightbox();
  if (!items || !items.length) return;
  const overlay = document.createElement('div');
  overlay.className = 'gq-lb';
  overlay.id = 'gqLb';
  overlay.setAttribute('role', 'dialog');
  overlay.innerHTML = `<button type="button" class="lb-x" aria-label="Закрыть">✕</button>
    <button type="button" class="lb-nav lb-prev" aria-label="Предыдущее">‹</button>
    <img alt="" referrerpolicy="no-referrer">
    <button type="button" class="lb-nav lb-next" aria-label="Следующее">›</button>
    <div class="lb-cap"></div><div class="lb-count"></div>`;
  document.body.appendChild(overlay);
  const img = overlay.querySelector('img');
  const cap = overlay.querySelector('.lb-cap');
  const count = overlay.querySelector('.lb-count');
  const prev = overlay.querySelector('.lb-prev');
  const next = overlay.querySelector('.lb-next');
  let index = start || 0;
  const show = (i) => {
    index = (i + items.length) % items.length;
    const it = items[index];
    img.src = it.url;
    const text = it.caption || '';
    cap.textContent = text;
    cap.hidden = !text;
    count.textContent = items.length > 1 ? (index + 1) + ' / ' + items.length : '';
    count.hidden = items.length < 2;
    prev.hidden = items.length < 2;
    next.hidden = items.length < 2;
  };
  const close = () => closeEditorLightbox();
  overlay.querySelector('.lb-x').addEventListener('click', (e) => { e.stopPropagation(); close(); });
  prev.addEventListener('click', (e) => { e.stopPropagation(); show(index - 1); });
  next.addEventListener('click', (e) => { e.stopPropagation(); show(index + 1); });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay._onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); show(index - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); show(index + 1); }
  };
  document.addEventListener('keydown', overlay._onKey);
  show(index);
}
function closeEditorLightbox() {
  const lb = document.getElementById('gqLb');
  if (!lb) return;
  if (lb._onKey) document.removeEventListener('keydown', lb._onKey);
  lb.remove();
}

let galleryDraft = { items: [], caption: '', _live: false };

function galleryCap() { return (GQ.MAX_GALLERY_ITEMS || 10); }

async function probeSrc(raw) {
  const rewritten = (GQ.normalizeExternalGifUrl && GQ.normalizeExternalGifUrl(raw)) || '';
  const safe = rewritten || (GQ.publicImageUrl && GQ.publicImageUrl(raw)) || GQ.userImageUrl(raw);
  if (!safe) return { ok: false };
  if (safe.startsWith('data:')) return { ok: true, url: safe, width: 0, height: 0 };
  toast('Проверяю, что картинка открывается…', 'ok');
  const loaded = GQ.probeImageLoad
    ? await GQ.probeImageLoad(safe)
    : await new Promise((res) => { const im = new Image(); im.onload = () => res({ ok: true, width: im.naturalWidth, height: im.naturalHeight }); im.onerror = () => res({ ok: false }); im.src = safe; });
  if (!loaded || !loaded.ok) return { ok: false, url: safe };
  return { ok: true, url: safe, width: loaded.width || 0, height: loaded.height || 0 };
}

function commitGalleryDraft() {
  const r = cur();
  if (!r) return toast('Нет открытого обзора', 'warn');
  if (!galleryDraft.items.length) return toast('Добавьте хотя бы одно изображение.', 'warn');
  const items = galleryDraft.items.map((it) => ({
    url: it.url,
    width: it.width || 0,
    height: it.height || 0,
    caption: (it.caption || '').trim(),
    alt: (it.alt || it.caption || '').trim(),
    origin: it.origin || 'url',
  }));
  const first = items[0];
  const payload = { url: first.url, width: first.width, height: first.height, alt: first.alt, origin: first.origin, caption: (galleryDraft.caption || '').trim(), items };
  if (insCtx && insCtx.replace) {
    const b = findBlock(insCtx.replace);
    if (b) {
      b.type = 'image';
      b.data = payload;
      delete b.html;
      touch();
      renderBlocks();
      closeModal('insModal');
      toast(items.length > 1 ? 'Коллаж обновлён' : 'Изображение обновлено', 'ok');
      return true;
    }
  }
  addBlock('image', (insCtx && insCtx.after) || (typeof afterCaretBlock === 'function' ? afterCaretBlock() : null), payload);
  closeModal('insModal');
  toast(items.length > 1 ? 'Коллаж вставлен' : 'Изображение вставлено', 'ok');
  return true;
}

async function commitImage(data, opts) {
  // back-compat helper used by tests / leftover calls: one image into a new/existing draft
  const skipProbe = opts && opts.skipProbe;
  let item = { url: data.url, width: data.width || 0, height: data.height || 0, caption: data.caption || '', alt: data.alt || '', origin: data.origin || 'url' };
  if (!skipProbe) {
    const got = await probeSrc(item.url);
    if (!got.ok) return toast('Адрес принят, но изображение не загружается. Проверьте ссылку.', 'err');
    item.url = got.url;
    if (!item.width && got.width) { item.width = got.width; item.height = got.height; }
  } else {
    item.url = (GQ.publicImageUrl && GQ.publicImageUrl(item.url)) || GQ.userImageUrl(item.url);
    if (!item.url) return toast('Нельзя вставить этот адрес. Нужна ссылка https:// на картинку.', 'warn');
  }
  galleryDraft = { items: [item], caption: data.blockCaption || '', _live: true };
  return commitGalleryDraft();
}

function paintGalleryDraft() {
  const box = $('#galList');
  if (!box) return;
  if (!galleryDraft.items.length) {
    box.innerHTML = '<div class="empty">Пока нет фото — добавьте по URL или с компьютера. Можно несколько в одном блоке.</div>';
    return;
  }
  box.innerHTML = galleryDraft.items.map((it, i) => {
    const url = GQ.userImageUrl(it.url) || it.url;
    return `<div class="gal-item" data-i="${i}">
      <img src="${esc(url)}" alt="" referrerpolicy="no-referrer">
      <div class="gal-meta">
        <input class="inp gal-cap" data-i="${i}" placeholder="Подпись к этому фото (в лайтбоксе)" value="${esc(it.caption || '')}">
        <div class="gal-move">
          <button type="button" class="ghost gal-up" data-i="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="ghost gal-dn" data-i="${i}" ${i === galleryDraft.items.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="ghost gal-rm" data-i="${i}">Удалить</button>
        </div>
      </div>
    </div>`;
  }).join('');
  box.querySelectorAll('.gal-cap').forEach((inp) => inp.addEventListener('input', () => {
    const i = +inp.getAttribute('data-i');
    if (galleryDraft.items[i]) galleryDraft.items[i].caption = inp.value;
  }));
  box.querySelectorAll('.gal-up').forEach((btn) => btn.addEventListener('click', () => {
    const i = +btn.getAttribute('data-i');
    if (i > 0) { const t = galleryDraft.items[i - 1]; galleryDraft.items[i - 1] = galleryDraft.items[i]; galleryDraft.items[i] = t; paintGalleryDraft(); }
  }));
  box.querySelectorAll('.gal-dn').forEach((btn) => btn.addEventListener('click', () => {
    const i = +btn.getAttribute('data-i');
    if (i < galleryDraft.items.length - 1) { const t = galleryDraft.items[i + 1]; galleryDraft.items[i + 1] = galleryDraft.items[i]; galleryDraft.items[i] = t; paintGalleryDraft(); }
  }));
  box.querySelectorAll('.gal-rm').forEach((btn) => btn.addEventListener('click', () => {
    const i = +btn.getAttribute('data-i');
    galleryDraft.items.splice(i, 1);
    paintGalleryDraft();
  }));
}

function drawImageIns() {
  const b = $('#insBody');
  if (!b) return;
  $('#insTitle').textContent = insCtx.replace ? 'Изменить изображения' : 'Вставить изображения';
  $('#insSub').textContent = 'Одно фото или коллаж: несколько снимков в одном блоке, подписи к каждому и общая подпись снизу.';
  if (!(galleryDraft && galleryDraft._live)) {
    if (insCtx && insCtx.replace) {
      const blk = findBlock(insCtx.replace);
      const d = (blk && blk.data) || {};
      galleryDraft = { items: galleryItems(d).map((it) => Object.assign({}, it)), caption: d.caption || '', _live: true };
    } else {
      galleryDraft = { items: [], caption: '', _live: true };
    }
  }
  b.innerHTML = `<div class="img-ins">
    <div id="galList" class="gal-list"></div>
    <div class="field"><label>Добавить по URL</label><input class="inp" id="imgUrl" placeholder="https://… или ссылка Giphy/Tenor"></div>
    <div class="img-actions">
      <button class="pri" id="imgUrlGo" type="button">＋ Добавить по URL</button>
      <button class="ghost" id="imgFileGo" type="button">📂 С компьютера (можно несколько)</button>
    </div>
    <div class="field"><label>Общая подпись под коллажом или одиночным фото</label><input class="inp" id="imgSharedCap" placeholder="Необязательно"></div>
    <div class="img-actions">
      <button class="pri" id="imgCommit" type="button">Готово</button>
    </div>
    <p class="img-hint" id="imgHint">Вставьте публичную HTTPS-ссылку на картинку или GIF (Imgur, Giphy, Tenor, Steam CDN и др.). При выборе файла с компьютера изображение сожмётся в локальную копию (видна только владельцам расширения). Подпись к каждому фото видна при открытии в просмотре, общая — под блоком.</p>
  </div>`;
  paintGalleryDraft();
  const shared = $('#imgSharedCap');
  if (shared) {
    shared.value = galleryDraft.caption || '';
    shared.addEventListener('input', () => { galleryDraft.caption = shared.value; });
  }
  $('#imgUrlGo').addEventListener('click', async () => {
    const raw = ($('#imgUrl').value || '').trim();
    if (!raw) return toast('Вставьте https-ссылку на картинку (http будет заменён на https, другие схемы запрещены).', 'warn');
    if (galleryDraft.items.length >= galleryCap()) return toast('В одном блоке не больше ' + galleryCap() + ' фото.', 'warn');
    const got = await probeSrc(raw);
    if (!got.ok) return toast('Адрес принят, но изображение не загружается. Проверьте ссылку.', 'err');
    galleryDraft.items.push({ url: got.url, width: got.width || 0, height: got.height || 0, caption: '', alt: '', origin: 'url' });
    $('#imgUrl').value = '';
    paintGalleryDraft();
  });
  $('#imgFileGo').addEventListener('click', () => $('#gqImgFile').click());
  $('#imgCommit').addEventListener('click', () => commitGalleryDraft());
}

const _gqRenderInsBody = renderInsBody;
renderInsBody = function () {
  if (insCtx && insCtx.tab === 'image') { drawImageIns(); return; }
  _gqRenderInsBody();
};
const _gqRedrawIns = redrawIns;
redrawIns = function () {
  if (insCtx && insCtx.tab === 'image') return;
  _gqRedrawIns();
};
const _gqCloseModal = closeModal;
closeModal = function (id) {
  if (id === 'insModal') galleryDraft = { items: [], caption: '', _live: false };
  _gqCloseModal(id);
};

(function ensureImgFile() {
  if ($('#gqImgFile')) return;
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.id = 'gqImgFile';
  inp.accept = 'image/png,image/jpeg,image/webp,image/gif';
  inp.multiple = true;
  inp.hidden = true;
  document.body.appendChild(inp);
  inp.addEventListener('change', () => {
    const files = inp.files ? [...inp.files] : [];
    inp.value = '';
    if (files.length) ingestImageFiles(files, { draft: true });
  });
})();

async function packImageFile(file) {
  let rawBytes = null;
  try { rawBytes = new Uint8Array(await file.arrayBuffer()); } catch (e) { rawBytes = null; }
  const preserve = (GQ.shouldPreserveAnimation && GQ.shouldPreserveAnimation(file, rawBytes))
    || file.type === 'image/gif' || /\.gif$/i.test(file.name || '')
    || (GQ.isGifBytes && rawBytes && GQ.isGifBytes(rawBytes));
  if (!GQ.isRasterImageType(file.type) && !preserve) return { error: 'Поддерживаются PNG, JPEG, WebP и GIF' };
  let packed;
  try {
    if (preserve) {
      const limit = (GQ.MAX_UPLOAD_BYTES || (8 * 1024 * 1024));
      if ((rawBytes ? rawBytes.length : file.size) > limit) return { error: 'GIF слишком большой (лимит 8 МБ).', preserve: true };
      const dim = await new Promise((res) => {
        const im = new Image();
        const href = URL.createObjectURL(new Blob([rawBytes || file], { type: file.type || 'image/gif' }));
        im.onload = () => { URL.revokeObjectURL(href); res({ width: im.naturalWidth || 0, height: im.naturalHeight || 0 }); };
        im.onerror = () => { URL.revokeObjectURL(href); res({ width: 0, height: 0 }); };
        im.src = href;
      });
      const typ = (GQ.isGifBytes && rawBytes && GQ.isGifBytes(rawBytes)) || /gif/i.test(file.type || '') || /\.gif$/i.test(file.name || '')
        ? 'image/gif'
        : (file.type || 'image/webp');
      packed = { blob: new Blob([rawBytes || file], { type: typ }), type: typ, width: dim.width, height: dim.height, dataUrl: null, preserve: true };
    } else {
      packed = await GQ.compressImage(file, { maxBytes: 400 * 1024 });
      packed.preserve = false;
    }
  } catch (e) {
    return { error: 'Не удалось прочитать файл: ' + (e && e.message || e) };
  }
  return { packed, preserve };
}

async function ingestImageFiles(files, opts) {
  const list = [...(files || [])].filter(Boolean);
  if (!list.length) return;
  const useDraft = !!(opts && opts.draft);
  if (useDraft && !(galleryDraft && galleryDraft._live)) {
    openInsert('image', insCtx && insCtx.replace ? { replace: insCtx.replace } : {});
  }
  for (const file of list) {
    if ((galleryDraft.items || []).length >= galleryCap()) {
      toast('В одном блоке не больше ' + galleryCap() + ' фото.', 'warn');
      break;
    }
    toast('Готовлю изображение…', 'ok');
    const prep = await packImageFile(file);
    if (prep.error) { toast(prep.error, 'err'); continue; }
    const packed = prep.packed;
    const preserve = prep.preserve || packed.preserve;
    let b64;
    try { b64 = GQ.bytesToBase64(new Uint8Array(await packed.blob.arrayBuffer())); }
    catch (e) { toast('Не удалось подготовить файл к загрузке', 'err'); continue; }
    toast('Обрабатываю изображение…', 'ok');
    const up = await GQ.uploadImage({ name: file.name, contentType: packed.type, width: packed.width, height: packed.height, b64 });
    if (up && up.ok && up.url) {
      const item = { url: up.url, width: up.width || packed.width || 0, height: up.height || packed.height || 0, caption: '', alt: '', origin: 'upload' };
      if (useDraft && galleryDraft && galleryDraft._live) {
        galleryDraft.items.push(item);
        paintGalleryDraft();
      } else {
        galleryDraft = { items: [item], caption: '', _live: true };
        commitGalleryDraft();
      }
      if (up.warning) toast(up.warning, 'warn');
      else toast(up.animated === false && preserve ? 'Файл загружен. Если анимация не видна — вставьте гифку по URL (Giphy/Tenor).' : 'Изображение загружено на сайт.', 'ok');
      continue;
    }
    const reason = (up && up.error ? (up.error + '. ') : 'Прямая загрузка файлов на Backloggd недоступна. ');
    if (preserve) {
      toast(reason + 'GIF нельзя сжимать без потери анимации. Вставьте публичный URL гифки (Giphy, Tenor, Imgur) или войдите на сайте.', 'warn');
      if (!useDraft) openInsert('image', {});
      continue;
    }
    let local = packed;
    if (!local.dataUrl || local.dataUrl.length > GQ.MAX_DATA_IMAGE) {
      try { local = await GQ.compressImage(file, { maxEdge: 900, quality: 0.55, maxBytes: 20 * 1024 }); }
      catch (e) { local = null; }
    }
    if (local && local.dataUrl && local.dataUrl.length <= GQ.MAX_DATA_IMAGE) {
      if (confirm(reason + 'Вставить сжатую копию только для владельцев расширения? В опубликованном посте без расширения картинки не будет. Лучше вставить публичный https-адрес.')) {
        const item = { url: local.dataUrl, width: local.width, height: local.height, caption: '', alt: '', origin: 'local' };
        if (useDraft && galleryDraft && galleryDraft._live) { galleryDraft.items.push(item); paintGalleryDraft(); }
        else { galleryDraft = { items: [item], caption: '', _live: true }; commitGalleryDraft(); }
        toast('Вставлена локальная копия (только с расширением). Для всех — вставьте URL.', 'warn');
      } else {
        if (!useDraft) openInsert('image', {});
        toast(reason + 'Вставьте публичный URL изображения.', 'warn');
      }
      continue;
    }
    toast(reason + 'Файл слишком большой для поста. Вставьте публичный URL.', 'warn');
  }
}

async function ingestImageFile(file) {
  return ingestImageFiles(file ? [file] : [], { draft: !!(insCtx && insCtx.tab === 'image') });
}

function gqImageFiles(dt) {
  const out = [];
  if (!dt) return out;
  if (dt.files && dt.files.length) {
    for (const f of dt.files) if (GQ.isRasterImageType(f.type) || /\.gif$/i.test(f.name || '')) out.push(f);
  } else if (dt.items && dt.items.length) {
    for (const it of dt.items) {
      if (it.kind === 'file' && (GQ.isRasterImageType(it.type) || /\.gif$/i.test(it.name || ''))) {
        const f = it.getAsFile();
        if (f) out.push(f);
      }
    }
  }
  return out;
}
document.addEventListener('paste', (e) => {
  const files = gqImageFiles(e.clipboardData);
  if (!files.length) return;
  e.preventDefault();
  e.stopPropagation();
  ingestImageFiles(files, { draft: !!(insCtx && insCtx.tab === 'image') });
}, true);
document.addEventListener('dragover', (e) => {
  if (gqImageFiles(e.dataTransfer).length) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
});
document.addEventListener('drop', (e) => {
  const files = gqImageFiles(e.dataTransfer);
  if (!files.length) return;
  e.preventDefault();
  ingestImageFiles(files, { draft: !!(insCtx && insCtx.tab === 'image') });
});



/* --- темы редактора --- */
const GQ_THEMES_FALLBACK=[
  {id:'panax-dark',name:'PANAX Mono (чёрно-серый)',short:'PANAX',c1:'#18181b',c2:'#e4e4e7'},
  {id:'steam-slate',name:'Steam Slate (графит и синий)',short:'Steam',c1:'#171d25',c2:'#66c0f4'},
  {id:'emerald-hud',name:'Emerald HUD (изумрудный)',short:'Emerald',c1:'#121916',c2:'#3ddc97'},
  {id:'amber-noir',name:'Amber Noir (янтарный)',short:'Amber',c1:'#181411',c2:'#f59e0b'},
  {id:'gamequill',name:'GameQuill (фиолетовый)',short:'GameQuill',c1:'#11151f',c2:'#7c5cff'}
];
function gqThemeList(){
  const list=(GQ&&GQ.themeList)?GQ.themeList():GQ_THEMES_FALLBACK;
  return list.map(t=>Object.assign({},GQ_THEMES_FALLBACK.find(f=>f.id===t.id)||{},t));
}
function gqApplyTheme(id){
  const list=gqThemeList();
  const t=(GQ&&GQ.normalizeTheme)?GQ.normalizeTheme(id):(list.some(x=>x.id===id)?id:'panax-dark');
  document.documentElement.setAttribute('data-gq-theme',t);
  if(state&&state.settings)state.settings.theme=t;
  const info=list.find(x=>x.id===t)||list[0];
  const dot=$('#themeSwDot'),lbl=$('#themeSwLbl'),menu=$('#themeSwMenu');
  if(dot)dot.style.background=info.c2||'#e4e4e7';
  if(lbl)lbl.textContent=info.short||info.name;
  if(menu)$$('[data-theme]',menu).forEach(x=>x.classList.toggle('on',x.dataset.theme===t));
  const st=$('#stTheme');if(st&&st.value!==t)st.value=t;
  return t;
}
function gqInitThemeSwitcher(){
  const sw=$('#themeSw'),btn=$('#themeSwBtn'),menu=$('#themeSwMenu');
  if(!sw||!btn||!menu)return;
  menu.innerHTML=gqThemeList().map(th=>`<button type="button" class="theme-sw-opt" data-theme="${esc(th.id)}">
    <span class="theme-sw-swatch" style="background:linear-gradient(135deg,${esc(th.c1)},${esc(th.c2)})"></span>
    <span>${esc(th.name)}</span>
  </button>`).join('');
  const close=()=>{sw.classList.remove('open');btn.setAttribute('aria-expanded','false')};
  btn.addEventListener('click',e=>{e.stopPropagation();const open=!sw.classList.contains('open');sw.classList.toggle('open',open);btn.setAttribute('aria-expanded',String(open))});
  $$('[data-theme]',menu).forEach(opt=>opt.addEventListener('click',()=>{
    const t=gqApplyTheme(opt.dataset.theme);
    if(GQ&&GQ.setTheme)GQ.setTheme(t);
    save(true);
    close();
    const info=gqThemeList().find(x=>x.id===t);
    toast('Тема: '+(info?info.name:t),'ok');
  }));
  document.addEventListener('click',e=>{if(!sw.contains(e.target))close()});
}
function gqInitTheme(){
  gqInitThemeSwitcher();
  const fromState = state && state.settings && state.settings.theme;
  const start = fromState || (typeof localStorage !== 'undefined' && localStorage.getItem('gqTheme')) || 'panax-dark';
  gqApplyTheme(start);
  if (GQ && GQ.loadTheme) {
    GQ.loadTheme().then((t) => { if (t) gqApplyTheme(t); }).catch(() => {});
  }
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((c, area) => {
        if (area === 'local' && c.gqTheme) gqApplyTheme(c.gqTheme.newValue);
      });
    }
  } catch { /* ignore */ }
}

boot();
gqInitTheme();
if(!GQ.parentOrigin){$('#gqSend').style.display='none';$('#gqClose').style.display='none'}
GQ.post({type:'gq:ready'});
