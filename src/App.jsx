// ════════════════════════════════════════════════════════════════════════════
//  Match Predictor — Fixed & Improved
//  Changes vs original:
//  BUGS    ① HTTP→HTTPS for clubelo API (mixed-content crash on HTTPS pages)
//          ② eventsJson?.results — null-dereference guard in fetchTeamForm
//          ③ useEffect missing homeBonus dep (venue changes now re-predict live)
//          ④ AbortSignal.timeout → AbortController (Safari <16.4 compat)
//          ⑤ MatchCard finished check: null|undefined both handled
//          ⑥ IIFE in JSX results → proper ResultsView component
//  SECURITY ① window.open noopener,noreferrer (tabnapping fix)
//           ② HTTP → HTTPS (mixed-content policy)
//  PERF    ① useMemo for DATES in TodayMatches (was re-created every render)
//          ② useMemo for heavy results computations
//          ③ useCallback on all stable handlers in TeamInput & App
//          ④ TodayMatches useEffect: guard against stale state updates
//  UX/A11Y ① Keyboard nav in autocomplete (↑↓ Enter Esc)
//          ② role="combobox / listbox / option" + aria-activedescendant
//          ③ aria-live="polite" on error message
//          ④ Card.displayName set (React DevTools & profiler)
//          ⑤ market-grid-3 mobile fix: was a no-op, now collapses to 1 col
//          ⑥ Score matrix min cell size on mobile
//          ⑦ Accessible loading region labels
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useRef, useMemo, forwardRef } from "react";
import TodayMatches from "./TodayMatches";

// ── DATA ──────────────────────────────────────────────────────────────────────
const NATION_ELO = {
  "Argentina":2063,"France":2047,"England":2024,"Brazil":2002,"Spain":1994,
  "Portugal":1988,"Belgium":1962,"Netherlands":1958,"Germany":1952,"Italy":1941,
  "Croatia":1922,"Morocco":1895,"Uruguay":1882,"Colombia":1865,"USA":1843,
  "Mexico":1841,"Japan":1839,"Senegal":1832,"Switzerland":1831,"Denmark":1824,
  "Austria":1818,"Turkey":1812,"South Korea":1808,"Australia":1798,"Ukraine":1795,
  "Poland":1788,"Egypt":1782,"Nigeria":1778,"Ecuador":1774,"Chile":1770,
  "Czech Republic":1765,"Hungary":1758,"Serbia":1754,"Scotland":1748,"Wales":1740,
  "Iran":1738,"Algeria":1732,"Ivory Coast":1728,"Sweden":1720,"Slovakia":1716,
  "Greece":1712,"Romania":1708,"Paraguay":1704,"Peru":1700,"Bolivia":1695,
  "Venezuela":1690,"Cameroon":1688,"Ghana":1684,"Tunisia":1680,"Mali":1676,
  "South Africa":1672,"Saudi Arabia":1668,"Iraq":1664,"Israel":1660,"Norway":1658,
  "Finland":1654,"Ireland":1650,"Albania":1646,"Slovenia":1642,"Panama":1638,
  "Costa Rica":1634,"Honduras":1630,"Jamaica":1626,"Canada":1622,"Burkina Faso":1618,
  "Guinea":1614,"Zambia":1610,"Cape Verde":1606,"Qatar":1602,"Jordan":1598,
  "UAE":1594,"Uzbekistan":1590,"China":1586,"Thailand":1582,"New Zealand":1578,
  "Haiti":1566,"El Salvador":1562,"North Macedonia":1558,"Bosnia":1554,
  "Montenegro":1550,"Kosovo":1546,"Georgia":1542,"Iceland":1538,
  "Northern Ireland":1534,"Cyprus":1530,"Curacao":1526,"Trinidad":1522,
  "Guatemala":1518,"Cuba":1514,"Kenya":1510,"Zimbabwe":1506,"DR Congo":1494,
  "Gabon":1490,"Rwanda":1478,"Benin":1474,"Namibia":1470,"Tanzania":1466,
  "Uganda":1462,"Ethiopia":1458,"Mozambique":1454,"Angola":1450,"Malawi":1446,
  "Afghanistan":1400,"India":1420,"Pakistan":1390,"Bangladesh":1380,
};

const NATION_CONF = {
  "Argentina":"CONMEBOL","Brazil":"CONMEBOL","Uruguay":"CONMEBOL","Colombia":"CONMEBOL",
  "Chile":"CONMEBOL","Ecuador":"CONMEBOL","Paraguay":"CONMEBOL","Peru":"CONMEBOL",
  "Bolivia":"CONMEBOL","Venezuela":"CONMEBOL",
  "France":"UEFA","England":"UEFA","Spain":"UEFA","Portugal":"UEFA","Germany":"UEFA",
  "Italy":"UEFA","Belgium":"UEFA","Netherlands":"UEFA","Croatia":"UEFA","Switzerland":"UEFA",
  "Denmark":"UEFA","Austria":"UEFA","Turkey":"UEFA","Poland":"UEFA","Ukraine":"UEFA",
  "Czech Republic":"UEFA","Hungary":"UEFA","Serbia":"UEFA","Scotland":"UEFA","Wales":"UEFA",
  "Sweden":"UEFA","Slovakia":"UEFA","Greece":"UEFA","Romania":"UEFA","Norway":"UEFA",
  "Finland":"UEFA","Ireland":"UEFA","Albania":"UEFA","Slovenia":"UEFA","Israel":"UEFA",
  "North Macedonia":"UEFA","Bosnia":"UEFA","Montenegro":"UEFA","Kosovo":"UEFA",
  "Georgia":"UEFA","Iceland":"UEFA","Northern Ireland":"UEFA","Cyprus":"UEFA",
  "Morocco":"CAF","Egypt":"CAF","Nigeria":"CAF","Senegal":"CAF","Ivory Coast":"CAF",
  "Algeria":"CAF","Cameroon":"CAF","Ghana":"CAF","Tunisia":"CAF","Mali":"CAF",
  "South Africa":"CAF","Burkina Faso":"CAF","Guinea":"CAF","Zambia":"CAF",
  "Cape Verde":"CAF","DR Congo":"CAF","Gabon":"CAF","Rwanda":"CAF","Benin":"CAF",
  "Namibia":"CAF","Kenya":"CAF","Zimbabwe":"CAF","Tanzania":"CAF","Uganda":"CAF",
  "Ethiopia":"CAF","Mozambique":"CAF","Angola":"CAF","Malawi":"CAF",
  "Japan":"AFC","South Korea":"AFC","Australia":"AFC","Iran":"AFC","Saudi Arabia":"AFC",
  "Iraq":"AFC","Jordan":"AFC","UAE":"AFC","Uzbekistan":"AFC","China":"AFC",
  "Thailand":"AFC","Qatar":"AFC","India":"AFC","Afghanistan":"AFC",
  "USA":"CONCACAF","Mexico":"CONCACAF","Canada":"CONCACAF","Panama":"CONCACAF",
  "Costa Rica":"CONCACAF","Honduras":"CONCACAF","Jamaica":"CONCACAF","Haiti":"CONCACAF",
  "El Salvador":"CONCACAF","Trinidad":"CONCACAF","Guatemala":"CONCACAF",
  "Cuba":"CONCACAF","Curacao":"CONCACAF","New Zealand":"OFC",
};

const SLUG_MAP = {
  "manchester city":"ManCity","man city":"ManCity","arsenal":"Arsenal",
  "liverpool":"Liverpool","chelsea":"Chelsea","manchester united":"ManUnited",
  "man united":"ManUnited","man utd":"ManUnited","tottenham":"Tottenham",
  "spurs":"Tottenham","newcastle":"Newcastle","newcastle united":"Newcastle",
  "aston villa":"AstonVilla","west ham":"WestHam","west ham united":"WestHam",
  "brighton":"Brighton","fulham":"Fulham","brentford":"Brentford",
  "crystal palace":"CrystalPalace","wolves":"Wolves","wolverhampton":"Wolves",
  "everton":"Everton","nottingham forest":"NottinghamForest","forest":"NottinghamForest",
  "bournemouth":"Bournemouth","leicester":"Leicester","southampton":"Southampton",
  "ipswich":"Ipswich",
  "real madrid":"RealMadrid","barcelona":"Barcelona","atletico madrid":"Atletico",
  "atletico":"Atletico","atletico de madrid":"Atletico","sevilla":"Sevilla",
  "real sociedad":"RealSociedad","athletic bilbao":"AthleticBilbao",
  "athletic club":"AthleticBilbao","villarreal":"Villarreal","real betis":"RealBetis",
  "betis":"RealBetis","valencia":"Valencia","osasuna":"Osasuna","girona":"Girona",
  "celta vigo":"CeltaVigo","getafe":"Getafe","alaves":"Alaves","las palmas":"LasPalmas",
  "mallorca":"Mallorca","rayo vallecano":"RayoVallecano","valladolid":"Valladolid",
  "espanyol":"Espanyol","leganes":"Leganes",
  "bayern munich":"BayernMunich","bayern":"BayernMunich",
  "borussia dortmund":"Dortmund","dortmund":"Dortmund",
  "bayer leverkusen":"Leverkusen","leverkusen":"Leverkusen",
  "rb leipzig":"RBLeipzig","leipzig":"RBLeipzig",
  "eintracht frankfurt":"EintrachtFrankfurt","frankfurt":"EintrachtFrankfurt",
  "wolfsburg":"Wolfsburg","freiburg":"Freiburg","union berlin":"UnionBerlin",
  "hoffenheim":"Hoffenheim","augsburg":"Augsburg","werder bremen":"Bremen",
  "bremen":"Bremen","mainz":"Mainz","stuttgart":"Stuttgart",
  "borussia monchengladbach":"MgladBach","gladbach":"MgladBach",
  "inter milan":"Inter","inter":"Inter","ac milan":"Milan","milan":"Milan",
  "juventus":"Juventus","juve":"Juventus","napoli":"Napoli","as roma":"Roma",
  "roma":"Roma","lazio":"Lazio","atalanta":"Atalanta","fiorentina":"Fiorentina",
  "bologna":"Bologna","torino":"Torino","udinese":"Udinese","monza":"Monza",
  "genoa":"Genoa","lecce":"Lecce","cagliari":"Cagliari","como":"Como",
  "venezia":"Venezia","verona":"Verona","parma":"Parma",
  "psg":"ParisSG","paris sg":"ParisSG","paris saint-germain":"ParisSG",
  "paris saint germain":"ParisSG","monaco":"Monaco","marseille":"Marseille",
  "lyon":"Lyon","lille":"Lille","nice":"Nice","rennes":"Rennes","lens":"Lens",
  "strasbourg":"Strasbourg","toulouse":"Toulouse",
  "ajax":"Ajax","psv":"PSV","psv eindhoven":"PSV","feyenoord":"Feyenoord",
  "az alkmaar":"AZAlkmaar","az":"AZAlkmaar","twente":"Twente",
  "porto":"Porto","benfica":"Benfica","sporting cp":"SportingCP",
  "sporting":"SportingCP","braga":"Braga",
  "celtic":"Celtic","rangers":"Rangers",
  "red bull salzburg":"Salzburg","salzburg":"Salzburg",
  "galatasaray":"Galatasaray","fenerbahce":"Fenerbahce","besiktas":"Besiktas",
  "trabzonspor":"Trabzonspor",
  "boca juniors":"BocaJuniors","river plate":"RiverPlate","flamengo":"Flamengo",
  "fluminense":"Fluminense","palmeiras":"Palmeiras","corinthians":"Corinthians",
  "atletico mineiro":"AtleticoMG",
  "inter miami":"InterMiami","la galaxy":"LAGalaxy","seattle sounders":"SeattleSounders",
  "atlanta united":"AtlantaUnited","new york city":"NewYorkCity","nycfc":"NewYorkCity",
  "club america":"ClubAmerica","chivas":"Chivas","guadalajara":"Chivas",
  "anderlecht":"Anderlecht","club brugge":"ClubBrugge","brugge":"ClubBrugge",
  "shakhtar":"Shakhtar","shakhtar donetsk":"Shakhtar",
  "red star":"RedStar","red star belgrade":"RedStar",
  "young boys":"YoungBoys","slavia prague":"SlaviaPrague","sparta prague":"SpartaPrague",
  "olympiacos":"Olympiacos","paok":"PAOK",
};

const LEAGUE_META = {
  "English Premier League":               { short:"EPL",      color:"#3D195B", text:"#E0AAFF", sport:"football" },
  "Spanish La Liga":                       { short:"La Liga",  color:"#C60B1E", text:"#FFD700", sport:"football" },
  "German Bundesliga":                     { short:"BL",       color:"#D00000", text:"#FFFFFF", sport:"football" },
  "Italian Serie A":                       { short:"Serie A",  color:"#009246", text:"#FFFFFF", sport:"football" },
  "French Ligue 1":                        { short:"L1",       color:"#002654", text:"#FFFFFF", sport:"football" },
  "UEFA Champions League":                 { short:"UCL",      color:"#0A1464", text:"#FFD700", sport:"football" },
  "UEFA Europa League":                    { short:"UEL",      color:"#F77F00", text:"#FFFFFF", sport:"football" },
  "UEFA Conference League":                { short:"UECL",     color:"#00A651", text:"#FFFFFF", sport:"football" },
  "Dutch Eredivisie":                      { short:"ERE",      color:"#E0421B", text:"#FFFFFF", sport:"football" },
  "Portuguese Primeira Liga":              { short:"PL",       color:"#006600", text:"#FFD700", sport:"football" },
  "Scottish Premiership":                  { short:"SPL",      color:"#003DA5", text:"#FFFFFF", sport:"football" },
  "Turkish Süper Lig":                     { short:"SL",       color:"#E30A17", text:"#FFFFFF", sport:"football" },
  "Major League Soccer":                   { short:"MLS",      color:"#002B5C", text:"#91C4F2", sport:"football" },
  "Brazilian Série A":                     { short:"BRA",      color:"#009C3B", text:"#FFD700", sport:"football" },
  "Argentine Primera División":            { short:"ARG",      color:"#74ACDF", text:"#FFFFFF", sport:"football" },
  "Saudi Professional League":             { short:"SPL SA",   color:"#006C35", text:"#FFFFFF", sport:"football" },
  "Egyptian Premier League":               { short:"EPL EG",   color:"#C8102E", text:"#FFFFFF", sport:"football" },
  "FIFA World Cup":                        { short:"WC",       color:"#B8860B", text:"#FFFFFF", sport:"football" },
  "FIFA World Cup Qualification":          { short:"WCQ",      color:"#8A6A00", text:"#FFDD00", sport:"football" },
  "FIFA World Cup Qualification - UEFA":   { short:"WCQ EU",   color:"#003399", text:"#FFDD00", sport:"football" },
  "FIFA World Cup Qualification - CONMEBOL":{ short:"WCQ SA",  color:"#0038A8", text:"#FFD700", sport:"football" },
  "FIFA World Cup Qualification - CAF":    { short:"WCQ AF",   color:"#009B3A", text:"#FFD700", sport:"football" },
  "FIFA World Cup Qualification - AFC":    { short:"WCQ AS",   color:"#CC0001", text:"#FFFFFF", sport:"football" },
  "UEFA European Championship":            { short:"EURO",     color:"#003399", text:"#FFD700", sport:"football" },
  "UEFA European Championship Qualifying": { short:"EURO Q",   color:"#003399", text:"#AABBFF", sport:"football" },
  "Copa America":                          { short:"Copa Am",  color:"#0038A8", text:"#FFD700", sport:"football" },
  "Africa Cup of Nations":                 { short:"AFCON",    color:"#009B3A", text:"#FFD700", sport:"football" },
  "AFC Asian Cup":                         { short:"AFC Cup",  color:"#CC0001", text:"#FFFFFF", sport:"football" },
  "CONCACAF Gold Cup":                     { short:"Gold Cup", color:"#0032A0", text:"#FFD700", sport:"football" },
  "UEFA Nations League":                   { short:"UNL",      color:"#003399", text:"#AACCFF", sport:"football" },
  "International Friendly":               { short:"Friendly", color:"#2A3A55", text:"#8898B8", sport:"football" },
  "NBA":                                   { short:"NBA",      color:"#C9082A", text:"#FFFFFF", sport:"basketball" },
  "EuroLeague":                            { short:"EL",       color:"#0046AD", text:"#FFFFFF", sport:"basketball" },
  "NCAA Men's Basketball":                 { short:"NCAA",     color:"#002868", text:"#FFFFFF", sport:"basketball" },
  "ICC Cricket World Cup":                 { short:"CWC",      color:"#003366", text:"#FFD700", sport:"cricket" },
  "Indian Premier League":                 { short:"IPL",      color:"#1A237E", text:"#FFD700", sport:"cricket" },
};

const KNOWN_LEAGUES = new Set(Object.keys(LEAGUE_META));

const LEAGUE_GROUPS = {
  "⚽ Top 5 European": ["English Premier League","Spanish La Liga","German Bundesliga","Italian Serie A","French Ligue 1"],
  "🏆 European Cups":  ["UEFA Champions League","UEFA Europa League","UEFA Conference League"],
  "🌍 International Football": [
    "FIFA World Cup","FIFA World Cup Qualification","UEFA European Championship",
    "UEFA European Championship Qualifying","Copa America","Africa Cup of Nations",
    "AFC Asian Cup","CONCACAF Gold Cup","UEFA Nations League","International Friendly",
  ],
  "🌐 Europe — Other":  ["Dutch Eredivisie","Portuguese Primeira Liga","Scottish Premiership","Turkish Süper Lig"],
  "🌎 Americas":        ["Major League Soccer","Brazilian Série A","Argentine Primera División"],
  "🌙 Middle East & Africa": ["Saudi Professional League","Egyptian Premier League"],
  "🏀 Basketball":      ["NBA","EuroLeague","NCAA Men's Basketball"],
  "🏏 Cricket":         ["ICC Cricket World Cup","Indian Premier League"],
};

const DEFAULT_LEAGUES = [
  "English Premier League","Spanish La Liga","German Bundesliga","Italian Serie A",
  "French Ligue 1","UEFA Champions League","UEFA Europa League",
  "FIFA World Cup","UEFA European Championship","Copa America","Africa Cup of Nations",
];

// ── ESPN SCOREBOARD LEAGUE MAP ───────────────────────────────────────────────
// ESPN's public scoreboard API has CORS headers (Access-Control-Allow-Origin: *)
// so it works directly from any origin — no proxy needed.
// Endpoint: https://site.api.espn.com/apis/site/v2/sports/{sport}/{slug}/scoreboard
const ESPN_LEAGUES = {
  "English Premier League":     { sport:"soccer",     slug:"eng.1"                   },
  "Spanish La Liga":             { sport:"soccer",     slug:"esp.1"                   },
  "German Bundesliga":           { sport:"soccer",     slug:"ger.1"                   },
  "Italian Serie A":             { sport:"soccer",     slug:"ita.1"                   },
  "French Ligue 1":              { sport:"soccer",     slug:"fra.1"                   },
  "UEFA Champions League":       { sport:"soccer",     slug:"uefa.champions"          },
  "UEFA Europa League":          { sport:"soccer",     slug:"uefa.europa"             },
  "UEFA Conference League":      { sport:"soccer",     slug:"uefa.europa.conference"  },
  "Dutch Eredivisie":            { sport:"soccer",     slug:"ned.1"                   },
  "Portuguese Primeira Liga":    { sport:"soccer",     slug:"por.1"                   },
  "Scottish Premiership":        { sport:"soccer",     slug:"sco.1"                   },
  "Turkish Süper Lig":           { sport:"soccer",     slug:"tur.1"                   },
  "Major League Soccer":         { sport:"soccer",     slug:"usa.1"                   },
  "Brazilian Série A":           { sport:"soccer",     slug:"bra.1"                   },
  "Argentine Primera División":  { sport:"soccer",     slug:"arg.1"                   },
  "Saudi Professional League":   { sport:"soccer",     slug:"sau.1"                   },
  "Egyptian Premier League":     { sport:"soccer",     slug:"egy.1"                   },
  "FIFA World Cup":              { sport:"soccer",     slug:"fifa.world"              },
  "UEFA European Championship":  { sport:"soccer",     slug:"uefa.euro"              },
  "Copa America":                { sport:"soccer",     slug:"conmebol.america"        },
  "Africa Cup of Nations":       { sport:"soccer",     slug:"caf.nations"             },
  "UEFA Nations League":         { sport:"soccer",     slug:"uefa.nations"            },
  "International Friendly":      { sport:"soccer",     slug:"fifa.friendly"           },
  "NBA":                         { sport:"basketball", slug:"nba"                     },
};

// ── CLUB ELO DB ───────────────────────────────────────────────────────────────
const CLUB_ELO_DB = {
  "ManCity":1942,"Arsenal":1898,"Liverpool":1921,"Chelsea":1853,"ManUnited":1836,
  "Tottenham":1816,"Newcastle":1807,"AstonVilla":1821,"WestHam":1771,"Brighton":1784,
  "Fulham":1741,"Brentford":1748,"CrystalPalace":1723,"Wolves":1738,"Everton":1712,
  "NottinghamForest":1756,"Bournemouth":1731,"Leicester":1701,"Southampton":1680,"Ipswich":1675,
  "RealMadrid":2008,"Barcelona":1962,"Atletico":1908,"AthleticBilbao":1813,
  "RealSociedad":1792,"Villarreal":1778,"RealBetis":1768,"Sevilla":1741,
  "Osasuna":1721,"Girona":1748,"CeltaVigo":1718,"Getafe":1701,"Alaves":1695,
  "LasPalmas":1688,"Mallorca":1705,"RayoVallecano":1698,"Valladolid":1672,
  "Espanyol":1690,"Leganes":1681,"Valencia":1714,
  "BayernMunich":1988,"Leverkusen":1921,"Dortmund":1868,"RBLeipzig":1862,
  "EintrachtFrankfurt":1791,"Stuttgart":1778,"Wolfsburg":1751,"Freiburg":1748,
  "UnionBerlin":1724,"Hoffenheim":1718,"Augsburg":1708,"Bremen":1714,
  "Mainz":1702,"MgladBach":1731,
  "Inter":1934,"Milan":1878,"Juventus":1851,"Napoli":1841,"Atalanta":1858,
  "Lazio":1798,"Roma":1812,"Fiorentina":1781,"Bologna":1768,"Torino":1731,
  "Udinese":1714,"Monza":1708,"Genoa":1691,"Lecce":1678,"Cagliari":1682,
  "Como":1671,"Venezia":1655,"Verona":1668,"Parma":1661,
  "ParisSG":1951,"Monaco":1821,"Marseille":1791,"Lille":1784,"Lyon":1762,
  "Nice":1748,"Rennes":1731,"Lens":1724,"Strasbourg":1698,"Toulouse":1688,
  "Ajax":1812,"PSV":1848,"Feyenoord":1834,"AZAlkmaar":1778,"Twente":1761,
  "Porto":1858,"Benfica":1841,"SportingCP":1828,"Braga":1784,
  "Celtic":1748,"Rangers":1728,
  "Galatasaray":1818,"Fenerbahce":1804,"Besiktas":1764,"Trabzonspor":1731,
  "Salzburg":1801,
  "Flamengo":1862,"RiverPlate":1858,"BocaJuniors":1831,"Fluminense":1814,
  "Palmeiras":1841,"Corinthians":1778,"AtleticoMG":1821,
  "InterMiami":1724,"LAGalaxy":1712,"SeattleSounders":1708,"AtlantaUnited":1701,
  "NewYorkCity":1698,"ClubAmerica":1791,"Chivas":1748,
  "ClubBrugge":1778,"Anderlecht":1748,
  "Shakhtar":1798,"RedStar":1761,"SlaviaPrague":1748,"SpartaPrague":1731,
  "YoungBoys":1724,"Olympiacos":1718,"PAOK":1708,
};

const LEAGUE_ELO_MAP = {
  "English Premier League":1780,"Spanish La Liga":1760,"German Bundesliga":1755,
  "Italian Serie A":1745,"French Ligue 1":1720,"UEFA Champions League":1870,
  "UEFA Europa League":1780,"UEFA Conference League":1720,
  "Dutch Eredivisie":1740,"Portuguese Primeira Liga":1730,"Scottish Premiership":1680,
  "Turkish Süper Lig":1700,"Major League Soccer":1680,"Brazilian Série A":1750,
  "Argentine Primera División":1740,"Saudi Professional League":1700,"Egyptian Premier League":1640,
};

// ── MATH ──────────────────────────────────────────────────────────────────────
function toSlug(name) {
  const key = name.toLowerCase().trim();
  if (SLUG_MAP[key]) return SLUG_MAP[key];
  return name.trim().split(/[\s-]+/).map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join("");
}
function poisPMF(k, lam) {
  if (lam <= 0) return k === 0 ? 1 : 0;
  let lp = -lam + k * Math.log(lam);
  for (let i = 1; i <= k; i++) lp -= Math.log(i);
  return Math.exp(lp);
}
function dcTau(h, a, lH, lA) {
  const rho = -0.13;
  if (h===0&&a===0) return 1 - lH*lA*rho;
  if (h===0&&a===1) return 1 + lH*rho;
  if (h===1&&a===0) return 1 + lA*rho;
  if (h===1&&a===1) return 1 - rho;
  return 1;
}
function runPredict(eloH, eloA, homeBonus, formH=0.5, formA=0.5) {
  const delta = (eloH + homeBonus - eloA) / 200;
  const fAdjH = (formH - 0.5) * 0.40;
  const fAdjA = (formA - 0.5) * 0.40;
  const lH = Math.max(0.3, Math.min((1.55 + delta * 0.52) * (1 + fAdjH), 5.5));
  const lA = Math.max(0.3, Math.min((1.10 - delta * 0.48) * (1 + fAdjA), 5.5));
  let hw=0, d=0, aw=0, over15=0, over25=0, over35=0, btts=0;
  const scores = [];
  for (let h = 0; h <= 10; h++) {
    for (let a = 0; a <= 10; a++) {
      const prob = poisPMF(h,lH)*poisPMF(a,lA)*dcTau(h,a,lH,lA);
      if (h>a) hw+=prob; else if (h===a) d+=prob; else aw+=prob;
      if (h+a>1.5) over15+=prob;
      if (h+a>2.5) over25+=prob;
      if (h+a>3.5) over35+=prob;
      if (h>0&&a>0) btts+=prob;
      if (prob>0.0004) scores.push({h,a,prob});
    }
  }
  scores.sort((x,y) => y.prob-x.prob);
  // FIX ④: use named loop vars to avoid shadowed `_` parameter names
  const matrix = Array.from({length:6},(_r,hr)=>Array.from({length:6},(_c,ar)=>poisPMF(hr,lH)*poisPMF(ar,lA)*dcTau(hr,ar,lH,lA)));
  const ahHome=hw, ahAway=aw+d, margin=1.05;
  const oddH=hw>0?(margin/hw).toFixed(2):"—";
  const oddD=d>0?(margin/d).toFixed(2):"—";
  const oddA=aw>0?(margin/aw).toFixed(2):"—";
  const maxProb=Math.max(hw,d,aw);
  const confidence=Math.max(0,Math.min(100,Math.round(((maxProb-0.33)/0.67)*100)));
  return {hw,d,aw,lH,lA,scores:scores.slice(0,10),matrix,over15,over25,over35,btts,ahHome,ahAway,oddH,oddD,oddA,confidence};
}

// ── FETCH ─────────────────────────────────────────────────────────────────────
const PROXIES = [
  url => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

// FIX ④: Helper using AbortController for broad browser support (replaces AbortSignal.timeout)
function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(id));
}

async function sportsDBFetch(path) {
  // Key "1" = free tier. Key "3" requires a paid Patreon subscription.
  const base = `https://www.thesportsdb.com/api/v1/json/1/${path}`;
  // Direct fetch is CORS-blocked on virtually every origin — TheSportsDB does not
  // send Access-Control-Allow-Origin for unknown origins, so we skip it and rotate
  // through proxies immediately.
  for (const makeProxy of PROXIES) {
    try {
      const res = await fetchWithTimeout(makeProxy(base), 9000);
      if (!res.ok) continue;
      const text = await res.text();
      // allorigins wraps response: { contents: "<raw json string>" }
      // corsproxy.io and codetabs return the raw JSON directly
      let json;
      try {
        const parsed = JSON.parse(text);
        json = parsed?.contents ? JSON.parse(parsed.contents) : parsed;
      } catch { continue; }
      if (json) return json;
    } catch { continue; }
  }
  return null;
}

async function searchTeamOnSportsDB(teamName) {
  try {
    const json = await sportsDBFetch(`searchteams.php?t=${encodeURIComponent(teamName)}`);
    const teams = (json?.teams||[]).filter(t=>t.strSport==="Soccer");
    if (!teams.length) return null;
    const best = teams.find(t=>t.strTeam.toLowerCase()===teamName.toLowerCase())||teams[0];
    const league = best.strLeague||"";
    return { ok:true, club:best.strTeam, elo:LEAGUE_ELO_MAP[league]||1580, date:"2026 (auto)", source:`${league||"Unknown"} avg` };
  } catch { return null; }
}

async function fetchClubElo(teamName, onStatus) {
  const slug = toSlug(teamName);
  if (CLUB_ELO_DB[slug]) return { ok:true, club:teamName, elo:CLUB_ELO_DB[slug], date:"2026 (static)", source:"clubelo.com" };
  const slugLower = slug.toLowerCase();
  const fuzzyKey = Object.keys(CLUB_ELO_DB).find(k=>k.toLowerCase().includes(slugLower)||slugLower.includes(k.toLowerCase()));
  if (fuzzyKey) return { ok:true, club:teamName, elo:CLUB_ELO_DB[fuzzyKey], date:"2026 (static)", source:"clubelo.com" };
  onStatus?.(`Searching for ${teamName}...`);
  // FIX ① SECURITY: Use HTTPS to avoid mixed-content policy errors on HTTPS pages
  const apiUrl = `https://api.clubelo.com/${slug}`;
  for (const makeProxy of PROXIES) {
    try {
      const res = await fetchWithTimeout(makeProxy(apiUrl), 6000);
      if (!res.ok) continue;
      const raw = await res.text();
      let csv = raw;
      try { const j=JSON.parse(raw); if(j.contents) csv=j.contents; } catch(_) {}
      if (!csv||csv.includes("No team")||csv.trim().length===0) break;
      const lines = csv.split("\n").map(l=>l.trim()).filter(l=>l&&!l.startsWith("R")&&l.length>5);
      if (!lines.length) continue;
      const fields = lines[lines.length-1].split(",");
      if (fields.length<6) continue;
      const elo = parseFloat(fields[4]);
      if (isNaN(elo)) continue;
      return { ok:true, club:fields[1]?.trim()||teamName, elo, date:fields[5]?.trim()||"", source:"clubelo.com (live)" };
    } catch(_) { continue; }
  }
  onStatus?.(`Looking up ${teamName}...`);
  const dbResult = await searchTeamOnSportsDB(teamName);
  if (dbResult) return dbResult;
  return { ok:true, club:teamName, elo:1580, date:"2026 (default)", source:"estimated" };
}

async function fetchNationElo(teamName) {
  const direct = NATION_ELO[teamName];
  if (direct) return { ok:true, club:teamName, elo:direct, date:"2026", source:"eloratings.net" };
  const key = teamName.toLowerCase();
  const match = Object.keys(NATION_ELO).find(k=>k.toLowerCase().includes(key)||key.includes(k.toLowerCase()));
  if (match) return { ok:true, club:match, elo:NATION_ELO[match], date:"2026", source:"eloratings.net" };
  const dbResult = await searchTeamOnSportsDB(teamName);
  if (dbResult) return dbResult;
  return { ok:true, club:teamName, elo:1500, date:"2026 (default)", source:"estimated" };
}

async function fetchTeamForm(teamName) {
  try {
    const searchJson = await sportsDBFetch(`searchteams.php?t=${encodeURIComponent(teamName)}`);
    const teams = (searchJson?.teams||[]).filter(t=>t.strSport==="Soccer");
    if (!teams.length) return null;
    const teamId = teams[0].idTeam;
    const eventsJson = await sportsDBFetch(`eventslast.php?id=${teamId}`);
    // FIX ②: Guard against null eventsJson before accessing .results
    const events = (eventsJson?.results||[]).slice(0,6);
    if (!events.length) return null;
    let points=0, played=0;
    const recentForm=[];
    events.forEach(ev => {
      const hScore=parseInt(ev.intHomeScore), aScore=parseInt(ev.intAwayScore);
      if (isNaN(hScore)||isNaN(aScore)) return;
      const nameLower=teamName.toLowerCase();
      const isHome=ev.strHomeTeam.toLowerCase().includes(nameLower)||nameLower.includes(ev.strHomeTeam.toLowerCase());
      let result;
      if (isHome) { if(hScore>aScore){points+=3;result="W";}else if(hScore===aScore){points+=1;result="D";}else result="L"; }
      else { if(aScore>hScore){points+=3;result="W";}else if(aScore===hScore){points+=1;result="D";}else result="L"; }
      played++; recentForm.push(result);
    });
    if (!played) return null;
    return { formScore:points/(played*3), recentForm, played };
  } catch { return null; }
}

// ── FIXTURES ──────────────────────────────────────────────────────────────────
function getDateRange(days=6) {
  return Array.from({length:days},(_,i)=>{
    const d=new Date(); d.setDate(d.getDate()+i); return d.toISOString().slice(0,10);
  });
}
function formatDateLabel(str) {
  const today=new Date().toISOString().slice(0,10);
  const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);
  if (str===today) return "Today";
  if (str===tomorrow) return "Tomorrow";
  return new Date(str+"T12:00:00").toLocaleDateString([],{weekday:"short",month:"short",day:"numeric"});
}
function formatKickoff(timeStr) {
  if (!timeStr) return "TBD";
  try {
    // ESPN sends ISO-8601 ("2026-05-12T19:45:00Z"); TheSportsDB sends "HH:MM:SS"
    if (timeStr.includes("T")) return new Date(timeStr).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
    const [h,m]=timeStr.split(":");
    const d=new Date(); d.setUTCHours(+h,+m,0);
    return d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
  } catch { return timeStr.slice(0,5); }
}
// Convert one ESPN event object into the shape MatchCard expects
function espnEventToMatch(ev, leagueName) {
  const comp      = ev.competitions?.[0];
  const home      = comp?.competitors?.find(c => c.homeAway === "home");
  const away      = comp?.competitors?.find(c => c.homeAway === "away");
  const state     = ev.status?.type?.state;        // "pre" | "in" | "post"
  const completed = ev.status?.type?.completed;
  const hasScore  = completed || state === "in";
  return {
    strHomeTeam:  home?.team?.displayName || "?",
    strAwayTeam:  away?.team?.displayName || "?",
    intHomeScore: hasScore ? (home?.score ?? null) : null,
    intAwayScore: hasScore ? (away?.score ?? null) : null,
    strStatus:    completed ? "Match Finished" : state === "in" ? "In Progress" : "",
    dateEvent:    ev.date?.slice(0, 10),   // "2026-05-12"
    strTime:      ev.date,                 // full ISO string for formatKickoff
    strLeague:    leagueName,
  };
}

// Fetch all fixtures for one ESPN league on a given date (YYYY-MM-DD).
// Returns [] on empty, null on total failure.
async function fetchESPNDay(leagueName, sport, slug, dateStr) {
  const d   = dateStr.replace(/-/g, "");   // "20260512"
  const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${slug}/scoreboard?dates=${d}`;
  try {
    const res = await fetchWithTimeout(url, 8000);
    if (!res.ok) return null;
    const json = await res.json();
    return (json.events || []).map(ev => espnEventToMatch(ev, leagueName));
  } catch { return null; }
}


// ── SHARED UI PRIMITIVES ──────────────────────────────────────────────────────
const Card = forwardRef(({children, className="", style={}, id}, ref) => (
  <div ref={ref} id={id} className={className}
    style={{background:"rgba(255,255,255,0.018)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:18,...style}}>
    {children}
  </div>
));
Card.displayName = "Card";
const LBL = {fontSize:10,letterSpacing:"0.22em",textTransform:"uppercase",color:"#4A5870",fontWeight:700};

function LeaguePill({league}) {
  const m=LEAGUE_META[league]||{short:(league||"?").slice(0,6),color:"#1A2A40",text:"#8898B8"};
  return <span style={{background:m.color,color:m.text,fontSize:9,fontWeight:700,letterSpacing:"0.09em",padding:"2px 7px",borderRadius:4,textTransform:"uppercase",flexShrink:0}}>{m.short}</span>;
}

function SkeletonCard() {
  return (
    <div style={{minWidth:210,flexShrink:0,background:"rgba(255,255,255,0.015)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:13,padding:"13px 15px"}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
        <div style={{width:44,height:14,background:"rgba(255,255,255,0.06)",borderRadius:3}}/>
        <div style={{width:32,height:14,background:"rgba(255,255,255,0.04)",borderRadius:3}}/>
      </div>
      <div style={{width:"80%",height:13,background:"rgba(255,255,255,0.05)",borderRadius:3,marginBottom:8}}/>
      <div style={{width:"65%",height:13,background:"rgba(255,255,255,0.04)",borderRadius:3}}/>
    </div>
  );
}

function MatchCard({event,onSelect}) {
  const [hov,setHov]=useState(false);
  // FIX ⑤: Check both null AND undefined — intHomeScore is undefined for upcoming matches
  const finished = event.strStatus==="Match Finished" || event.intHomeScore != null;
  const kickoff=formatKickoff(event.strTime);
  const sport=LEAGUE_META[event.strLeague]?.sport||"football";
  return (
    <div
      onClick={()=>!finished&&onSelect(event.strHomeTeam,event.strAwayTeam,kickoff,event.strLeague)}
      onMouseEnter={()=>setHov(true)}
      onMouseLeave={()=>setHov(false)}
      role={finished ? undefined : "button"}
      tabIndex={finished ? undefined : 0}
      onKeyDown={e=>{ if(!finished&&(e.key==="Enter"||e.key===" ")) onSelect(event.strHomeTeam,event.strAwayTeam,kickoff,event.strLeague); }}
      aria-label={finished ? undefined : `Predict ${event.strHomeTeam} vs ${event.strAwayTeam}`}
      style={{minWidth:210,flexShrink:0,background:hov&&!finished?"rgba(0,230,118,0.06)":"rgba(255,255,255,0.025)",border:`1px solid ${hov&&!finished?"rgba(0,230,118,0.22)":"rgba(255,255,255,0.06)"}`,borderRadius:13,padding:"13px 15px",cursor:finished?"default":"pointer",transition:"all 0.18s",opacity:finished?0.55:1,position:"relative"}}
    >
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <LeaguePill league={event.strLeague}/>
        <span style={{fontSize:10,fontFamily:"'Space Mono',monospace",fontWeight:700,color:finished?"#FF6060":"#00B856"}}>{finished?"FT":kickoff}</span>
      </div>
      {[{name:event.strHomeTeam,score:event.intHomeScore},{name:event.strAwayTeam,score:event.intAwayScore}].map((t,i)=>(
        <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:i===0?6:0}}>
          <span style={{fontSize:13,fontWeight:700,color:"#CDD8EE",fontFamily:"'Barlow',sans-serif",maxWidth:148,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{t.name}</span>
          {finished&&<span style={{fontFamily:"'Space Mono',monospace",fontSize:15,fontWeight:700,color:"#D8E2F0",flexShrink:0,marginLeft:6}}>{t.score??"–"}</span>}
        </div>
      ))}
      {!finished&&hov&&<div style={{position:"absolute",bottom:8,right:11,fontSize:9,color:sport==="football"?"#00C864":"#4D9EFF",fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase"}}>{sport==="football"?"▶ Predict":"👁 View"}</div>}
    </div>
  );
}






function useAnimatedNum(target,duration=1200) {
  const [val,setVal]=useState(0);
  useEffect(()=>{
    let s=null,raf;
    const tick=ts=>{ if(!s)s=ts; const t=Math.min((ts-s)/duration,1); setVal(target*(1-Math.pow(1-t,3))); if(t<1)raf=requestAnimationFrame(tick); };
    raf=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(raf);
  },[target,duration]);
  return val;
}
function AnimNum({value,decimals=0,duration=1200}) { const v=useAnimatedNum(value,duration); return <>{v.toFixed(decimals)}</>; }

function ProbBar({label,prob,color,delay=0}) {
  const [w,setW]=useState(0);
  useEffect(()=>{ const t=setTimeout(()=>setW(prob*100),delay+80); return()=>clearTimeout(t); },[prob,delay]);
  return (
    <div style={{marginBottom:13}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
        <span style={{fontSize:11,letterSpacing:"0.15em",textTransform:"uppercase",color:"#5A6A88",fontWeight:700}}>{label}</span>
        <span style={{fontFamily:"'Space Mono',monospace",fontSize:13,color,fontWeight:700}}>{(prob*100).toFixed(1)}%</span>
      </div>
      <div style={{height:5,background:"rgba(255,255,255,0.05)",borderRadius:3,overflow:"hidden"}} role="progressbar" aria-valuenow={Math.round(prob*100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${label} probability`}>
        <div style={{height:"100%",width:`${w}%`,background:color,borderRadius:3,transition:"width 1.3s cubic-bezier(0.34,1.56,0.64,1)"}}/>
      </div>
    </div>
  );
}

function ScoreMatrix({matrix,topScore}) {
  // FIX PERF: avoid spread + flat for max; use nested loop instead
  const maxP=useMemo(()=>{
    let m=0;
    for(const row of matrix) for(const v of row) if(v>m) m=v;
    return m;
  },[matrix]);
  return (
    <div>
      <div style={{display:"flex",gap:3,marginBottom:3,paddingLeft:26}}>
        {[0,1,2,3,4,5].map(a=><div key={a} style={{flex:1,textAlign:"center",fontFamily:"'Space Mono',monospace",fontSize:9,color:"#FF4D6D",opacity:0.7}}>{a}</div>)}
      </div>
      {matrix.map((row,h)=>(
        <div key={h} style={{display:"flex",gap:3,marginBottom:3,alignItems:"center"}}>
          <div style={{width:22,textAlign:"right",fontFamily:"'Space Mono',monospace",fontSize:9,color:"#4D9EFF",opacity:0.7,flexShrink:0,paddingRight:2}}>{h}</div>
          {row.map((prob,a)=>{
            const intensity=maxP>0?prob/maxP:0;
            const isTop=topScore&&h===topScore.h&&a===topScore.a;
            const g=Math.round(60+intensity*195);
            const alpha=0.08+intensity*0.85;
            // FIX UX ⑥: min cell size for mobile readability
            return <div key={a} title={`${h}–${a}: ${(prob*100).toFixed(1)}%`} aria-label={`Score ${h}-${a}: ${(prob*100).toFixed(1)}%`} style={{flex:1,minWidth:18,aspectRatio:"1",borderRadius:3,background:isTop?"#00E676":`rgba(0,${g},55,${alpha})`,border:`1px solid ${isTop?"#00E676":`rgba(0,${g},55,${Math.min(alpha+0.25,1)})`}`,boxShadow:isTop?"0 0 8px rgba(0,230,118,0.5)":"none",cursor:"default"}}/>;
          })}
        </div>
      ))}
      <div style={{display:"flex",justifyContent:"space-between",marginTop:6,paddingLeft:25}}>
        <span style={{fontSize:9,color:"#4D9EFF",opacity:0.5,letterSpacing:"0.08em"}}>HOME GOALS ↕</span>
        <span style={{fontSize:9,color:"#FF4D6D",opacity:0.5,letterSpacing:"0.08em"}}>AWAY GOALS →</span>
      </div>
    </div>
  );
}

function EloSlider({label,color,elo,originalElo,onChange}) {
  const diff=elo-originalElo;
  return (
    <div style={{flex:1}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <span style={{fontSize:10,letterSpacing:"0.15em",textTransform:"uppercase",color:"#4A5870",fontWeight:700}}>{label}</span>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          {diff!==0&&<span style={{fontSize:10,color:diff>0?"#00E676":"#FF4D6D",fontWeight:700}}>{diff>0?"+":""}{diff.toFixed(0)}</span>}
          <span style={{fontFamily:"'Space Mono',monospace",fontSize:15,color,fontWeight:700}}>{elo.toFixed(0)}</span>
        </div>
      </div>
      <input type="range" min={600} max={2200} step={5} value={elo}
        aria-label={`${label} Elo rating`}
        aria-valuemin={600} aria-valuemax={2200} aria-valuenow={Math.round(elo)}
        onChange={e=>onChange(parseFloat(e.target.value))}
        style={{width:"100%",accentColor:color,cursor:"pointer"}}/>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:3}}>
        <span style={{fontSize:9,color:"#263550"}}>600 amateur</span>
        <span style={{fontSize:9,color:"#263550"}}>2200 elite</span>
      </div>
      {diff!==0&&<button onClick={()=>onChange(originalElo)} style={{marginTop:5,background:"transparent",border:"1px solid rgba(255,255,255,0.08)",borderRadius:5,color:"#4A5070",fontSize:10,padding:"3px 8px",cursor:"pointer"}}>↺ Reset to {originalElo.toFixed(0)}</button>}
    </div>
  );
}

// FIX UX ①②: TeamInput — keyboard navigation (↑↓ Enter Esc) + ARIA combobox pattern
function TeamInput({label,value,onChange,accentColor,placeholder,mode}) {
  const [suggestions,setSuggestions]=useState([]);
  const [focused,setFocused]=useState(false);
  const [activeIdx,setActiveIdx]=useState(-1);
  const listId=useRef(null);
if(!listId.current) listId.current=`suggest-${Math.random().toString(36).slice(2)}`;
const id=listId.current;

  const getSuggestions=useCallback(v=>{
    if(v.length<2) return [];
    const q=v.toLowerCase();
    if(mode==="nations") return Object.keys(NATION_ELO).filter(k=>k.toLowerCase().includes(q)).slice(0,8);
    const seen=new Set();
    return Object.keys(SLUG_MAP).filter(k=>k.includes(q)).slice(0,8)
      .map(k=>k.split(" ").map(w=>w[0].toUpperCase()+w.slice(1)).join(" "))
      .filter(d=>{ if(seen.has(d))return false; seen.add(d); return true; });
  },[mode]);

  // FIX PERF ③: stable handleChange with useCallback
  const handleChange=useCallback(v=>{
    onChange(v);
    setSuggestions(v.length>=2?getSuggestions(v):[]);
    setActiveIdx(-1);
  },[onChange,getSuggestions]);

  const selectSuggestion=useCallback(s=>{
    onChange(s);
    setSuggestions([]);
    setActiveIdx(-1);
  },[onChange]);

  const handleKeyDown=useCallback(e=>{
    if (!suggestions.length) return;
    if (e.key==="ArrowDown") { e.preventDefault(); setActiveIdx(i=>Math.min(i+1,suggestions.length-1)); }
    else if (e.key==="ArrowUp") { e.preventDefault(); setActiveIdx(i=>Math.max(i-1,-1)); }
    else if (e.key==="Enter" && activeIdx>=0) { e.preventDefault(); selectSuggestion(suggestions[activeIdx]); }
    else if (e.key==="Escape") { setSuggestions([]); setActiveIdx(-1); }
  },[suggestions,activeIdx,selectSuggestion]);

  return (
    <div style={{flex:1,position:"relative"}}>
      <div style={{fontSize:10,letterSpacing:"0.22em",textTransform:"uppercase",color:"#4A5870",marginBottom:10,fontWeight:700}}>{label}</div>
      <div style={{background:"rgba(255,255,255,0.025)",border:`1px solid ${focused?accentColor+"55":"rgba(255,255,255,0.07)"}`,borderRadius:12,transition:"border-color 0.3s,box-shadow 0.3s",boxShadow:focused?`0 0 0 3px ${accentColor}18`:"none"}}>
        {/* FIX UX ②: combobox role, aria-autocomplete, aria-expanded, aria-activedescendant */}
        <input
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={suggestions.length>0&&focused}
          aria-controls={id}
          aria-activedescendant={activeIdx>=0?`${id}-opt-${activeIdx}`:undefined}
          value={value}
          onChange={e=>handleChange(e.target.value)}
          onFocus={()=>{ setFocused(true); setSuggestions(getSuggestions(value)); }}
          onBlur={()=>setTimeout(()=>{ setFocused(false); setSuggestions([]); setActiveIdx(-1); },160)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          style={{width:"100%",background:"transparent",border:"none",outline:"none",padding:"15px 18px",fontSize:17,fontWeight:600,color:"#DCE4F0",letterSpacing:"0.01em",fontFamily:"'Barlow',sans-serif"}}
        />
      </div>
      {suggestions.length>0&&focused&&(
        // FIX UX ②: listbox role + option roles for screen readers
        <ul id={id} role="listbox" aria-label={`${label} suggestions`}
          style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,zIndex:400,background:"#0D1627",border:"1px solid rgba(255,255,255,0.09)",borderRadius:9,overflow:"hidden",boxShadow:"0 20px 48px rgba(0,0,0,0.7)",listStyle:"none",margin:0,padding:0}}>
          {suggestions.map((s,i)=>(
            // FIX UX ③: key on suggestion text, not index — more stable for dynamic list
            <li key={s} id={`${id}-opt-${i}`} role="option" aria-selected={i===activeIdx}
             onPointerDown={e=>{e.preventDefault(); selectSuggestion(s);}}
              style={{padding:"10px 18px",fontSize:14,color:i===activeIdx?"#D8E2F0":"#B8C4D8",cursor:"pointer",borderBottom:i<suggestions.length-1?"1px solid rgba(255,255,255,0.04)":"none",display:"flex",justifyContent:"space-between",alignItems:"center",background:i===activeIdx?"rgba(255,255,255,0.08)":"transparent"}}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.05)"}
              onMouseLeave={e=>e.currentTarget.style.background=i===activeIdx?"rgba(255,255,255,0.08)":"transparent"}
            >
              <span>{s}</span>
              {mode==="nations"&&NATION_ELO[s]&&<span style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:"#3A5070"}}>{NATION_ELO[s]}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MarketBadge({label,value,sub,color="#00E676"}) {
  return (
    <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:10,padding:"10px 14px",textAlign:"center",flex:1}}>
      <div style={{fontSize:9,letterSpacing:"0.15em",textTransform:"uppercase",color:"#3A4A60",marginBottom:5,fontWeight:700}}>{label}</div>
      <div style={{fontFamily:"'Space Mono',monospace",fontSize:16,color,fontWeight:700}}>{value}</div>
      {sub&&<div style={{fontSize:10,color:"#2A3A55",marginTop:3}}>{sub}</div>}
    </div>
  );
}

function ConfidenceMeter({value,color}) {
  const [w,setW]=useState(0);
  useEffect(()=>{ const t=setTimeout(()=>setW(value),200); return()=>clearTimeout(t); },[value]);
  const label=value>=70?"High":value>=40?"Medium":"Low";
  return (
    <div style={{flex:1}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
        <span style={{fontSize:10,letterSpacing:"0.15em",textTransform:"uppercase",color:"#4A5870",fontWeight:700}}>Model Confidence</span>
        <span style={{fontFamily:"'Space Mono',monospace",fontSize:12,color,fontWeight:700}}>{label} · {value}%</span>
      </div>
      <div style={{height:5,background:"rgba(255,255,255,0.05)",borderRadius:3,overflow:"hidden"}} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label="Model confidence">
        <div style={{height:"100%",width:`${w}%`,background:`linear-gradient(90deg,${color}80,${color})`,borderRadius:3,transition:"width 1.4s cubic-bezier(0.34,1.2,0.64,1)"}}/>
      </div>
    </div>
  );
}

function FormBubbles({form,justify="flex-end"}) {
  if (!form?.recentForm) return null;
  return (
    <div style={{display:"flex",gap:3,marginTop:6,justifyContent:justify}} aria-label="Recent form">
      {form.recentForm.map((r,i)=>(
        <span key={i} aria-label={r==="W"?"Win":r==="D"?"Draw":"Loss"} style={{width:18,height:18,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,background:r==="W"?"rgba(0,230,118,0.15)":r==="D"?"rgba(255,184,0,0.15)":"rgba(255,77,109,0.15)",color:r==="W"?"#00E676":r==="D"?"#FFB800":"#FF4D6D",border:`1px solid ${r==="W"?"rgba(0,230,118,0.3)":r==="D"?"rgba(255,184,0,0.3)":"rgba(255,77,109,0.3)"}`}}>{r}</span>
      ))}
    </div>
  );
}

// ── ONBOARDING ────────────────────────────────────────────────────────────────
function OnboardingScreen({onDone}) {
  const [step,setStep]=useState(0);
  const [selected,setSelected]=useState(new Set(DEFAULT_LEAGUES));
  const toggle=useCallback(league=>setSelected(prev=>{ const n=new Set(prev); n.has(league)?n.delete(league):n.add(league); return n; }),[]);
  const toggleGroup=useCallback(leagues=>{ setSelected(prev=>{ const n=new Set(prev); const allOn=leagues.every(l=>n.has(l)); leagues.forEach(l=>allOn?n.delete(l):n.add(l)); return n; }); },[]);

  if (step===0) return (
    <div style={{position:"fixed",inset:0,zIndex:2000,overflowY:"auto",background:"radial-gradient(ellipse 80% 50% at 50% -10%,rgba(0,230,118,0.1) 0%,transparent 60%),linear-gradient(180deg,#060A14 0%,#08101E 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 20px",animation:"fadeUp 0.5s ease both"}}>
      <div style={{textAlign:"center",maxWidth:600}}>
        <div style={{display:"inline-flex",alignItems:"center",gap:8,background:"rgba(0,230,118,0.08)",border:"1px solid rgba(0,230,118,0.2)",borderRadius:20,padding:"6px 16px",marginBottom:28}}>
          <span style={{width:7,height:7,borderRadius:"50%",background:"#00E676",boxShadow:"0 0 8px #00E676",display:"inline-block"}}/>
          <span style={{fontSize:11,color:"#00B856",fontWeight:700,letterSpacing:"0.2em",textTransform:"uppercase"}}>Free · No Signup · Updated Daily</span>
        </div>
        <h1 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"clamp(44px,9vw,80px)",color:"#D8E2F0",letterSpacing:"0.04em",lineHeight:1,marginBottom:16}}>
          Predict Any<br/><span style={{color:"#00E676"}}>Football Match</span><br/>Instantly
        </h1>
        <p style={{fontSize:15,color:"#5A7090",lineHeight:1.75,marginBottom:36,maxWidth:460,margin:"0 auto 36px"}}>
          Enter two teams, get a full statistical breakdown — win probabilities, expected goals, top scorelines, betting markets & more. Powered by Elo ratings and the Dixon-Coles Poisson model.
        </p>
        <div style={{display:"flex",justifyContent:"center",gap:24,flexWrap:"wrap",marginBottom:40}}>
          {[["📊","Poisson + Dixon-Coles Model"],["🌍","30+ Leagues Covered"],["⚡","Live Fixture Feed"],["🔒","Zero Data Collected"]].map(([icon,text])=>(
            <div key={text} style={{display:"flex",alignItems:"center",gap:7,fontSize:12,color:"#3A5070"}}>
              <span style={{fontSize:16}}>{icon}</span>{text}
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:0,justifyContent:"center",marginBottom:44,maxWidth:500,margin:"0 auto 44px"}}>
          {[["1","Type Teams","Enter home & away team"],["2","Hit Predict","One click, instant analysis"],["3","Share Results","Send it to your group chat"]].map(([n,t,d],i)=>(
            <div key={n} style={{flex:1,textAlign:"center",padding:"0 12px",position:"relative"}}>
              {i<2&&<div style={{position:"absolute",top:16,right:0,width:"50%",height:1,background:"rgba(0,230,118,0.15)"}}/>}
              <div style={{width:34,height:34,borderRadius:"50%",background:"rgba(0,230,118,0.12)",border:"1px solid rgba(0,230,118,0.3)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 10px",fontFamily:"'Space Mono',monospace",fontSize:13,color:"#00E676",fontWeight:700}}>{n}</div>
              <div style={{fontSize:12,fontWeight:700,color:"#C0CCD8",marginBottom:4}}>{t}</div>
              <div style={{fontSize:11,color:"#3A5070"}}>{d}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
          <button onClick={()=>{onDone([...new Set(DEFAULT_LEAGUES)]);}} style={{background:"linear-gradient(135deg,#00C060,#00E676)",color:"#000",border:"none",padding:"16px 44px",borderRadius:11,fontFamily:"'Barlow',sans-serif",fontSize:13,fontWeight:700,letterSpacing:"0.14em",textTransform:"uppercase",cursor:"pointer",boxShadow:"0 6px 28px rgba(0,230,118,0.3)"}}>
            ▶ Quick Start — Predict Now
          </button>
          <button onClick={()=>setStep(1)} style={{background:"transparent",border:"1px solid rgba(255,255,255,0.12)",color:"#5A7090",padding:"16px 28px",borderRadius:11,fontFamily:"'Barlow',sans-serif",fontSize:13,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",cursor:"pointer"}}>
            ⚙ Choose My Leagues
          </button>
        </div>
        <div style={{fontSize:11,color:"#263550",marginTop:14}}>Quick Start uses top leagues. Change anytime in Settings.</div>
      </div>
    </div>
  );

  return (
    <div style={{position:"fixed",inset:0,zIndex:2000,overflowY:"auto",background:"radial-gradient(ellipse 90% 60% at 50% -10%,rgba(0,230,118,0.08) 0%,transparent 65%),linear-gradient(180deg,#060A14 0%,#08101E 100%)",display:"flex",flexDirection:"column",alignItems:"center",padding:"40px 20px 60px",animation:"fadeUp 0.5s ease both"}}>
      <div style={{textAlign:"center",marginBottom:32,maxWidth:540}}>
        <button onClick={()=>setStep(0)} style={{background:"transparent",border:"none",color:"#3A5070",fontSize:12,cursor:"pointer",marginBottom:16}}>← Back</button>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:40,color:"#D8E2F0",letterSpacing:"0.06em",lineHeight:1,marginBottom:8}}>Pick Your Leagues</div>
        <div style={{fontSize:13,color:"#3A5070",lineHeight:1.75}}>Only fixtures from your chosen leagues appear in the feed. Predictions work for all teams regardless.</div>
      </div>
      <div style={{width:"100%",maxWidth:620,marginBottom:32}}>
        {Object.entries(LEAGUE_GROUPS).map(([group,leagues])=>{
          const allOn=leagues.every(l=>selected.has(l));
          return (
            <div key={group} style={{marginBottom:22}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:11}}>
                <span style={{fontSize:12,color:"#8898B8",fontWeight:700,fontFamily:"'Barlow',sans-serif"}}>{group}</span>
                <div style={{flex:1,height:"1px",background:"rgba(255,255,255,0.05)"}}/>
                <button onClick={()=>toggleGroup(leagues)} style={{background:"transparent",border:"1px solid rgba(255,255,255,0.1)",color:"#4A5870",borderRadius:6,padding:"3px 10px",fontSize:10,cursor:"pointer",fontFamily:"'Barlow',sans-serif",fontWeight:700}}>{allOn?"Deselect all":"Select all"}</button>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {leagues.map(league=>{ const on=selected.has(league); const meta=LEAGUE_META[league]; return (
                  <button key={league} onClick={()=>toggle(league)} style={{padding:"7px 12px",borderRadius:8,cursor:"pointer",border:`1px solid ${on?(meta?.color||"#00E676")+"90":"rgba(255,255,255,0.07)"}`,background:on?(meta?.color||"#00E676")+"18":"rgba(255,255,255,0.02)",fontFamily:"'Barlow',sans-serif",fontSize:12,fontWeight:700,color:on?"#D8E2F0":"#4A5870",transition:"all 0.18s",display:"flex",alignItems:"center",gap:6}}>
                    {meta&&<span style={{background:meta.color,color:meta.text,fontSize:8,fontWeight:700,padding:"1px 5px",borderRadius:3,letterSpacing:"0.07em"}}>{meta.short}</span>}
                    {league}
                  </button>
                );})}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{textAlign:"center",position:"sticky",bottom:24}}>
        <button disabled={selected.size===0} onClick={()=>onDone([...selected])} style={{background:"linear-gradient(135deg,#00C060,#00E676)",color:"#000",border:"none",padding:"16px 52px",borderRadius:11,fontFamily:"'Barlow',sans-serif",fontSize:13,fontWeight:700,letterSpacing:"0.14em",textTransform:"uppercase",cursor:"pointer",boxShadow:"0 6px 28px rgba(0,230,118,0.3)",opacity:selected.size===0?0.35:1}}>
          Get Started — {selected.size} league{selected.size!==1?"s":""} selected →
        </button>
        <div style={{fontSize:10,color:"#2A3A55",marginTop:10}}>Change these anytime in Settings</div>
      </div>
    </div>
  );
}

// ── SETTINGS PANEL ────────────────────────────────────────────────────────────
function SettingsPanel({selectedLeagues,onSave,onClose}) {
  const [selected,setSelected]=useState(new Set(selectedLeagues));
  const toggle=useCallback(league=>setSelected(prev=>{ const n=new Set(prev); n.has(league)?n.delete(league):n.add(league); return n; }),[]);
  const toggleGroup=useCallback(leagues=>{ setSelected(prev=>{ const n=new Set(prev); const allOn=leagues.every(l=>n.has(l)); leagues.forEach(l=>allOn?n.delete(l):n.add(l)); return n; }); },[]);
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"flex-end",padding:20}} onClick={e=>e.target===e.currentTarget&&onClose()} role="dialog" aria-modal="true" aria-label="Settings">
      <div style={{background:"#0A1628",border:"1px solid rgba(255,255,255,0.08)",borderRadius:18,width:"100%",maxWidth:480,maxHeight:"90vh",overflow:"auto",padding:26,animation:"slideIn 0.3s cubic-bezier(0.34,1.2,0.64,1) both"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{fontSize:11,letterSpacing:"0.2em",textTransform:"uppercase",color:"#8898B8",fontWeight:700,fontFamily:"'Barlow',sans-serif"}}>⚙ Settings</div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{ onSave([...selected]); onClose(); }}
              style={{background:"linear-gradient(135deg,#00C060,#00E676)",color:"#000",border:"none",borderRadius:7,padding:"6px 16px",fontSize:10,cursor:"pointer",fontWeight:700,fontFamily:"'Barlow',sans-serif"}}>
              ✓ Save Changes
            </button>
            <button onClick={onClose} aria-label="Close settings" style={{background:"transparent",border:"1px solid rgba(255,255,255,0.1)",color:"#5A6A88",borderRadius:7,padding:"6px 12px",fontSize:10,cursor:"pointer",fontWeight:700,fontFamily:"'Barlow',sans-serif"}}>✕</button>
          </div>
        </div>
        {Object.entries(LEAGUE_GROUPS).map(([group,leagues])=>{ const allOn=leagues.every(l=>selected.has(l)); return (
          <div key={group} style={{marginBottom:20}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <span style={{fontSize:11,color:"#8898B8",fontWeight:700,fontFamily:"'Barlow',sans-serif"}}>{group}</span>
              <div style={{flex:1,height:"1px",background:"rgba(255,255,255,0.05)"}}/>
              <button onClick={()=>toggleGroup(leagues)} style={{background:"transparent",border:"1px solid rgba(255,255,255,0.08)",color:"#4A5070",borderRadius:5,padding:"2px 8px",fontSize:9,cursor:"pointer",fontFamily:"'Barlow',sans-serif",fontWeight:700}}>{allOn?"− All":"+ All"}</button>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
              {leagues.map(league=>{ const on=selected.has(league); const meta=LEAGUE_META[league]; return (
                <button key={league} onClick={()=>toggle(league)} style={{padding:"5px 10px",borderRadius:7,cursor:"pointer",border:`1px solid ${on?(meta?.color||"#00E676")+"80":"rgba(255,255,255,0.06)"}`,background:on?(meta?.color||"#00E676")+"15":"rgba(255,255,255,0.02)",fontFamily:"'Barlow',sans-serif",fontSize:11,fontWeight:700,color:on?"#D8E2F0":"#3A4A60",transition:"all 0.15s",display:"flex",alignItems:"center",gap:5}}>
                  {meta&&<span style={{background:meta.color,color:meta.text,fontSize:7,fontWeight:700,padding:"1px 4px",borderRadius:2}}>{meta.short}</span>}
                  {league}
                </button>
              );})}
            </div>
          </div>
        );})}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8,paddingTop:16,borderTop:"1px solid rgba(255,255,255,0.05)"}}>
          <button onClick={onClose} style={{background:"transparent",border:"1px solid rgba(255,255,255,0.1)",color:"#5A6A88",padding:"10px 20px",borderRadius:9,fontFamily:"'Barlow',sans-serif",fontSize:11,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",cursor:"pointer"}}>Cancel</button>
          <button onClick={()=>{ onSave([...selected]); onClose(); }} style={{background:"linear-gradient(135deg,#00C060,#00E676)",color:"#000",border:"none",padding:"10px 24px",borderRadius:9,fontFamily:"'Barlow',sans-serif",fontSize:11,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",cursor:"pointer"}}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}

// ── HISTORY PANEL ─────────────────────────────────────────────────────────────
function PrivacyModal({onClose}) {
  const sections = [
    { heading:"Last updated", body:"May 2026" },
    { heading:"Who we are",
      body:"Match Predictor is a free, browser-based football prediction tool made by ClearView. It uses statistical modelling (Poisson + Dixon-Coles) to estimate match outcomes. It is not affiliated with any bookmaker or betting service." },
    { heading:"Data we collect",
      body:"We do not collect your name, email, IP address, or any personally identifiable information. The only data stored on your device is your league preferences and prediction history, saved in your browser's localStorage. This data never leaves your device." },
    { heading:"Advertising & cookies (Google AdSense)",
      body:"This site uses Google AdSense to display ads. Third-party vendors, including Google, use cookies to serve ads based on your prior visits to this website or other websites. You may opt out of personalised advertising by visiting Google's Ads Settings at g.co/adsettings or www.aboutads.info." },
    { heading:"localStorage",
      body:"Two keys are stored locally: mp_onboarded (hides the welcome screen after your first visit) and mp_leagues (your saved league selection). Clear these anytime via your browser's \"Clear site data\" option." },
    { heading:"Third-party APIs",
      body:"Fixture data comes from ESPN's public scoreboard API (site.api.espn.com). Elo ratings may be fetched from clubelo.com and thesportsdb.com. All requests go directly from your browser — we do not proxy or log them." },
    { heading:"\u{1F1EA}\u{1F1FA}  EEA users — GDPR", regional:"eu",
      body:"If you are located in the European Economic Area, you have rights under the General Data Protection Regulation (GDPR): access, rectification, erasure, restriction, portability, and the right to object. We rely on your consent as the legal basis for serving personalised ads via Google AdSense (Art. 6(1)(a) GDPR). A consent banner will appear on your first visit. You may withdraw consent at any time at g.co/adsettings. For all other rights requests contact us via the ClearView website." },
    { heading:"\u{1F1EC}\u{1F1E7}  UK users — UK GDPR", regional:"uk",
      body:"If you are in the United Kingdom, the UK GDPR and Data Protection Act 2018 apply. Your rights mirror EU GDPR: access, rectification, erasure, restriction, portability, and objection. Personalised ads are served on the basis of your consent, which you may withdraw at any time at g.co/adsettings. We do not transfer your data outside the UK except where covered by adequacy regulations or appropriate safeguards." },
    { heading:"\u{1F1FA}\u{1F1F8}  California users — CCPA / CPRA", regional:"ca",
      body:"California residents have the right to: (1) know what personal information is collected, used, or shared; (2) delete personal information we hold; (3) opt out of the sale or sharing of personal information; (4) non-discrimination for exercising these rights. We do not sell your data, but sharing with Google for personalised advertising may constitute \"sale\" or \"sharing\" under CCPA. To opt out, visit g.co/adsettings or use the link at the bottom of this policy." },
    { heading:"Children",
      body:"This site is intended for general audiences. We do not knowingly collect data from children under 13 (or under 16 for EEA/UK users)." },
    { heading:"Gambling disclaimer",
      body:"Predictions are for entertainment only and are not financial or betting advice. Never gamble more than you can afford to lose. Visit begambleaware.org if you need support." },
    { heading:"Changes",
      body:"If this policy changes materially the 'Last updated' date will be revised. Continued use constitutes acceptance." },
    { heading:"Contact",
      body:"Questions or rights requests? Reach out via the ClearView website. We'll respond within 30 days." },
  ];

  const regionColor = { eu:"#4488EE", uk:"#EE4444", ca:"#4466AA" };
  const regionBg    = { eu:"rgba(0,51,153,0.12)", uk:"rgba(207,16,26,0.1)", ca:"rgba(0,51,102,0.12)" };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.80)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20,overflowY:"auto"}}
      onClick={e=>e.target===e.currentTarget&&onClose()} role="dialog" aria-modal="true" aria-label="Privacy Policy">
      <div style={{background:"#0A1628",border:"1px solid rgba(255,255,255,0.08)",borderRadius:18,width:"100%",maxWidth:560,maxHeight:"90vh",overflow:"auto",padding:"32px 28px",animation:"fadeUp 0.3s ease both"}}>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:26,color:"#D8E2F0",letterSpacing:"0.06em"}}>Privacy Policy</div>
          <button onClick={onClose} aria-label="Close privacy policy"
            style={{background:"transparent",border:"1px solid rgba(255,255,255,0.1)",color:"#5A6A88",borderRadius:7,padding:"6px 12px",fontSize:10,cursor:"pointer",fontWeight:700,fontFamily:"'Barlow',sans-serif"}}>✕ Close</button>
        </div>

        <div style={{display:"flex",gap:8,marginBottom:22,flexWrap:"wrap"}}>
          {[["🇪🇺 EEA","eu"],["🇬🇧 UK","uk"],["🇺🇸 California","ca"]].map(([label,key])=>(
            <a key={key} href={"#pp-"+key}
              style={{fontSize:10,fontWeight:700,fontFamily:"'Barlow',sans-serif",letterSpacing:"0.1em",
                padding:"5px 12px",borderRadius:6,textDecoration:"none",
                background:regionBg[key],border:"1px solid "+regionColor[key]+"55",color:regionColor[key]}}>
              {label} rights ↓
            </a>
          ))}
        </div>

        {sections.map(({heading,body,regional})=>(
          <div key={heading} id={regional?"pp-"+regional:undefined}
            style={{marginBottom:16, ...(regional ? {
              background:regionBg[regional],
              border:"1px solid "+regionColor[regional]+"40",
              borderRadius:10,padding:"14px 16px"
            } : {})}}>
            <div style={{fontSize:10,letterSpacing:"0.18em",textTransform:"uppercase",
              color:regional?regionColor[regional]:"#00B856",
              fontWeight:700,marginBottom:6,fontFamily:"'Barlow',sans-serif"}}>{heading}</div>
            <div style={{fontSize:12,color:"#6A7A90",lineHeight:1.75,fontFamily:"'Barlow',sans-serif"}}>{body}</div>
          </div>
        ))}

        <div style={{marginBottom:18,paddingTop:12,borderTop:"1px solid rgba(255,255,255,0.05)"}}>
          <a href="https://g.co/adsettings" target="_blank" rel="noopener noreferrer"
            style={{fontSize:11,color:"#4A6A99",fontFamily:"'Barlow',sans-serif",fontWeight:700,
              textDecoration:"underline",textUnderlineOffset:3}}>
            🚫 Do Not Sell or Share My Personal Information (California)
          </a>
        </div>

        <div style={{paddingTop:16,borderTop:"1px solid rgba(255,255,255,0.05)",textAlign:"center"}}>
          <button onClick={onClose}
            style={{background:"linear-gradient(135deg,#00C060,#00E676)",color:"#000",border:"none",
              padding:"10px 32px",borderRadius:9,fontFamily:"'Barlow',sans-serif",fontSize:12,
              fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",cursor:"pointer"}}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
function HistoryPanel({history,onClose,onReplay,onClear}) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"flex-end",padding:20}} onClick={e=>e.target===e.currentTarget&&onClose()} role="dialog" aria-modal="true" aria-label="Match history">
      <div style={{background:"#0A1628",border:"1px solid rgba(255,255,255,0.08)",borderRadius:18,width:"100%",maxWidth:440,maxHeight:"90vh",overflow:"auto",padding:24,animation:"slideIn 0.3s cubic-bezier(0.34,1.2,0.64,1) both"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{fontSize:11,letterSpacing:"0.2em",textTransform:"uppercase",color:"#8898B8",fontWeight:700,fontFamily:"'Barlow',sans-serif"}}>Match History ({history.length})</div>
          <div style={{display:"flex",gap:8}}>
            {history.length>0&&<button onClick={onClear} style={{background:"transparent",border:"1px solid rgba(255,100,100,0.25)",color:"#FF6B6B",borderRadius:7,padding:"6px 12px",fontSize:10,cursor:"pointer",fontWeight:700}}>Clear All</button>}
            <button onClick={onClose} aria-label="Close history" style={{background:"transparent",border:"1px solid rgba(255,255,255,0.1)",color:"#5A6A88",borderRadius:7,padding:"6px 12px",fontSize:10,cursor:"pointer",fontWeight:700}}>✕ Close</button>
          </div>
        </div>
        {history.length===0?(
          <div style={{textAlign:"center",color:"#2A3A55",fontSize:13,padding:"48px 0"}}><div style={{fontSize:32,marginBottom:12}}>📋</div>No predictions yet. Make your first one!</div>
        ):history.map((entry,i)=>{
          const {hw,d,aw}=entry.prediction;
          const homeWins=hw>aw&&hw>d,awayWins=aw>hw&&aw>d;
          const vc=homeWins?"#4D9EFF":awayWins?"#FF4D6D":"#FFB800";
          const vt=homeWins?entry.homeTeam:awayWins?entry.awayTeam:"Draw";
          const vp=homeWins?hw:awayWins?aw:d;
          return (
            <div key={i} onClick={()=>onReplay(entry)} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==="Enter"||e.key===" ")onReplay(entry);}}
              style={{marginBottom:10,padding:"14px 16px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:12,cursor:"pointer",transition:"background 0.15s",animation:`fadeUp 0.3s ${i*0.05}s ease both`}}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.04)"}
              onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.02)"}
            >
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div style={{fontSize:13,fontWeight:700,color:"#CDD8EE"}}>{entry.homeTeam} <span style={{color:"#2E3D55"}}>vs</span> {entry.awayTeam}</div>
                <div style={{fontSize:10,color:"#2A3A55"}}>{new Date(entry.timestamp).toLocaleDateString()}</div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:10,color:"#3A4A60"}}>{entry.mode==="nations"?"🌍":"🏟"} {entry.venueStr}</span>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <span style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:"#00E676",fontWeight:700}}>{entry.prediction.scores[0].h}–{entry.prediction.scores[0].a}</span>
                  <span style={{fontSize:11,color:vc,fontWeight:700}}>{vt} {(vp*100).toFixed(0)}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── RESULTS VIEW ──────────────────────────────────────────────────────────────
// FIX ⑥: Extracted from IIFE-in-JSX to a proper named component.
//   Benefits: correct React reconciliation, DevTools naming, memoizable, testable.
function ResultsView({prediction,homeTeam,awayTeam,homeData,awayData,homeForm,awayForm,
                      effectiveHomeElo,effectiveAwayElo,setHomeEloOverride,setAwayEloOverride,
                      mode,venueStr,copied,reset,shareWhatsApp,shareTwitter,copyResults}) {
  const {hw,d,aw,lH,lA,scores,matrix,over15,over25,over35,btts,ahHome,ahAway,oddH,oddD,oddA,confidence}=prediction;
  // FIX PERF ②: memoize derived verdict values
  const {homeWins,awayWins,verdictText,verdictColor,verdictProb,top,eloDiff,confH,confA} = useMemo(()=>{
    const hW=hw>aw&&hw>d, aW=aw>hw&&aw>d;
    return {
      homeWins:hW, awayWins:aW,
      verdictText:hW?`${homeTeam} Win`:aW?`${awayTeam} Win`:"Draw",
      verdictColor:hW?"#4D9EFF":aW?"#FF4D6D":"#FFB800",
      verdictProb:hW?hw:aW?aw:d,
      top:scores[0],
      eloDiff:effectiveHomeElo-effectiveAwayElo,
      confH:mode==="nations"?NATION_CONF[homeTeam]:null,
      confA:mode==="nations"?NATION_CONF[awayTeam]:null,
    };
  },[hw,d,aw,homeTeam,awayTeam,scores,effectiveHomeElo,effectiveAwayElo,mode]);

  return (
    <div style={{width:"100%",maxWidth:760}}>
      {/* TEAM OVERVIEW */}
      <Card className="fu" style={{padding:"22px 28px",marginBottom:14,textAlign:"center"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{...LBL}}>{venueStr}</div>
          <div style={{fontSize:10,color:"#2E3D55"}}>{mode==="nations"?"🌍 National Teams":"🏟 Club Teams"} · {homeData.source}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
          <div style={{flex:1,textAlign:"right"}}>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:30,color:"#D8E2F0",letterSpacing:"0.04em",lineHeight:1.1}}>{homeTeam}</div>
            {confH&&<div style={{fontSize:10,color:"#2E3D55",marginBottom:3}}>{confH}</div>}
            <div style={{fontFamily:"'Space Mono',monospace",fontSize:22,color:"#4D9EFF",fontWeight:700,marginTop:4}}><AnimNum value={effectiveHomeElo} decimals={0}/><span style={{fontSize:10,color:"#2E3D55",fontWeight:400,marginLeft:5}}>Elo</span></div>
            {homeData.date&&homeData.date!=="manual"&&<div style={{fontSize:9,color:"#2E3D55",marginTop:2}}>as of {homeData.date}</div>}
            <FormBubbles form={homeForm} justify="flex-end"/>
          </div>
          <div style={{width:46,height:46,flexShrink:0,borderRadius:"50%",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Bebas Neue',sans-serif",fontSize:16,color:"#2E3D55"}}>VS</div>
          <div style={{flex:1,textAlign:"left"}}>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:30,color:"#D8E2F0",letterSpacing:"0.04em",lineHeight:1.1}}>{awayTeam}</div>
            {confA&&<div style={{fontSize:10,color:"#2E3D55",marginBottom:3}}>{confA}</div>}
            <div style={{fontFamily:"'Space Mono',monospace",fontSize:22,color:"#FF4D6D",fontWeight:700,marginTop:4}}><AnimNum value={effectiveAwayElo} decimals={0}/><span style={{fontSize:10,color:"#2E3D55",fontWeight:400,marginLeft:5}}>Elo</span></div>
            {awayData.date&&awayData.date!=="manual"&&<div style={{fontSize:9,color:"#2E3D55",marginTop:2}}>as of {awayData.date}</div>}
            <FormBubbles form={awayForm} justify="flex-start"/>
          </div>
        </div>
        {Math.abs(eloDiff)>=30
          ?<div style={{marginTop:12,fontSize:12,color:"#4A5070"}}><span style={{color:eloDiff>0?"#4D9EFF":"#FF4D6D",fontWeight:600}}>{eloDiff>0?homeTeam:awayTeam}</span>{" stronger by "}<span style={{color:"#8898B8",fontWeight:600}}>{Math.abs(eloDiff).toFixed(0)} Elo pts</span></div>
          :<div style={{marginTop:12,fontSize:12,color:"#D4960A",fontWeight:600}}>⚖ EVENLY MATCHED</div>}
      </Card>

      {/* ELO SLIDERS */}
      <Card className="fu1" style={{padding:"20px 26px",marginBottom:14}}>
        <div style={{...LBL,marginBottom:16}}>🎛 Adjust Elo — updates prediction live</div>
        <div className="elo-sliders" style={{display:"flex",gap:32}}>
          <EloSlider label={homeTeam.length>12?homeTeam.slice(0,12)+"…":homeTeam} color="#4D9EFF" elo={effectiveHomeElo} originalElo={homeData.elo} onChange={setHomeEloOverride}/>
          <EloSlider label={awayTeam.length>12?awayTeam.slice(0,12)+"…":awayTeam} color="#FF4D6D" elo={effectiveAwayElo} originalElo={awayData.elo} onChange={setAwayEloOverride}/>
        </div>
      </Card>

      {/* xG + WIN PROB */}
      <div className="results-grid" style={{display:"grid",gridTemplateColumns:"1fr 1.6fr",gap:14,marginBottom:14}}>
        <Card className="fu2" style={{padding:"22px 24px"}}>
          <div style={{...LBL,marginBottom:18}}>Expected Goals</div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
            <div>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:46,color:"#4D9EFF",letterSpacing:"0.04em",lineHeight:1}}><AnimNum value={lH} decimals={2} duration={600}/></div>
              <div style={{fontSize:10,color:"#2E3D55",marginTop:3}}>{homeTeam.length>10?homeTeam.slice(0,10)+"…":homeTeam} xG</div>
            </div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:"#1A2338",paddingBottom:20}}>—</div>
            <div style={{textAlign:"right"}}>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:46,color:"#FF4D6D",letterSpacing:"0.04em",lineHeight:1}}><AnimNum value={lA} decimals={2} duration={600}/></div>
              <div style={{fontSize:10,color:"#2E3D55",marginTop:3}}>{awayTeam.length>10?awayTeam.slice(0,10)+"…":awayTeam} xG</div>
            </div>
          </div>
          <div style={{marginTop:14,paddingTop:12,borderTop:"1px solid rgba(255,255,255,0.04)",fontSize:11,color:"#2E3D55"}}>Total xG: <span style={{color:"#8898B8",fontWeight:600}}>{(lH+lA).toFixed(2)}</span></div>
        </Card>
        <Card className="fu3" style={{padding:"22px 26px"}}>
          <div style={{...LBL,marginBottom:18}}>Win Probability</div>
          <ProbBar label={homeTeam.length>14?homeTeam.slice(0,14)+"…":homeTeam} prob={hw} color="#4D9EFF" delay={200}/>
          <ProbBar label="Draw" prob={d} color="#FFB800" delay={350}/>
          <ProbBar label={awayTeam.length>14?awayTeam.slice(0,14)+"…":awayTeam} prob={aw} color="#FF4D6D" delay={500}/>
        </Card>
      </div>

      {/* BETTING MARKETS */}
      <Card className="fu4" style={{padding:"20px 24px",marginBottom:14}}>
        <div style={{...LBL,marginBottom:16}}>Betting Markets</div>
        <div className="market-grid-4" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:12}}>
          <MarketBadge label="Over 1.5" value={`${(over15*100).toFixed(1)}%`} sub={`${(1.05/over15).toFixed(2)} odds`} color="#00E676"/>
          <MarketBadge label="Over 2.5" value={`${(over25*100).toFixed(1)}%`} sub={`${(1.05/over25).toFixed(2)} odds`} color="#00C860"/>
          <MarketBadge label="Over 3.5" value={`${(over35*100).toFixed(1)}%`} sub={`${(1.05/over35).toFixed(2)} odds`} color="#009948"/>
          <MarketBadge label="BTTS" value={`${(btts*100).toFixed(1)}%`} sub={`${(1.05/btts).toFixed(2)} odds`} color="#FFB800"/>
        </div>
        <div className="market-grid-3" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
          <MarketBadge label="1 Home Win" value={oddH} sub={`${(hw*100).toFixed(1)}%`} color="#4D9EFF"/>
          <MarketBadge label="X Draw" value={oddD} sub={`${(d*100).toFixed(1)}%`} color="#FFB800"/>
          <MarketBadge label="2 Away Win" value={oddA} sub={`${(aw*100).toFixed(1)}%`} color="#FF4D6D"/>
        </div>
        <div style={{display:"flex",gap:12}}>
          <MarketBadge label="AH Home -0.5" value={`${(ahHome*100).toFixed(1)}%`} sub={`${(1.05/ahHome).toFixed(2)} odds`} color="#4D9EFF"/>
          <MarketBadge label="AH Away +0.5" value={`${(ahAway*100).toFixed(1)}%`} sub={`${(1.05/ahAway).toFixed(2)} odds`} color="#FF4D6D"/>
        </div>
      </Card>

      {/* SCORELINES + MATRIX */}
      <div className="results-grid2" style={{display:"grid",gridTemplateColumns:"1.1fr 1fr",gap:14,marginBottom:14}}>
        <Card className="fu5" style={{padding:"22px 24px"}}>
          <div style={{...LBL,marginBottom:18}}>Top Scorelines</div>
          {scores.map((s,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8,padding:i===0?"8px 11px":"3px 0",borderRadius:i===0?8:0,background:i===0?"rgba(0,230,118,0.07)":"transparent",border:i===0?"1px solid rgba(0,230,118,0.14)":"none"}}>
              <span style={{fontFamily:"'Space Mono',monospace",fontSize:i===0?15:12,fontWeight:700,color:i===0?"#00E676":"#8898B8",width:48,flexShrink:0}}>{s.h} — {s.a}</span>
              <div style={{flex:1,height:2.5,background:"rgba(255,255,255,0.04)",borderRadius:2,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${(s.prob/scores[0].prob)*100}%`,background:i===0?"#00E676":"rgba(255,255,255,0.15)",borderRadius:2}}/>
              </div>
              <span style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:i===0?"#00E676":"#3A4A60",width:30,textAlign:"right",flexShrink:0}}>{Math.round(s.prob*100)}%</span>
              {i===0&&<span style={{fontSize:10,color:"#00A846",flexShrink:0}}>★</span>}
            </div>
          ))}
        </Card>
        <Card className="fu5" style={{padding:"22px 24px"}}>
          <div style={{...LBL,marginBottom:14}}>Score Matrix</div>
          <ScoreMatrix matrix={matrix} topScore={top}/>
        </Card>
      </div>

      {/* VERDICT + CTA */}
      <div className="fu6" style={{background:`linear-gradient(135deg,${verdictColor}08,${verdictColor}14)`,border:`1px solid ${verdictColor}28`,borderRadius:18,padding:"24px 28px",marginBottom:14}}>
        <div className="verdict-inner" style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:20,marginBottom:18}}>
          <div>
            <div style={{...LBL,color:verdictColor,opacity:0.75,marginBottom:8}}>Verdict</div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:38,color:verdictColor,letterSpacing:"0.05em",lineHeight:1}}>{verdictText}</div>
            <div style={{fontFamily:"'Space Mono',monospace",fontSize:12,color:"#4A5070",marginTop:6}}>{(verdictProb*100).toFixed(1)}% probability</div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{...LBL,marginBottom:10}}>Most Likely Score</div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:58,color:"#00E676",letterSpacing:"0.06em",lineHeight:1}}>{top.h} — {top.a}</div>
            <div style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:"#4A5070",marginTop:5}}>{Math.round(top.prob*100)}% probability</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <button className="ghost-btn" onClick={reset}>← New Match</button>
          </div>
        </div>
        {/* SOCIAL SHARING */}
        <div className="share-row" style={{display:"flex",gap:8,alignItems:"center",paddingTop:14,borderTop:"1px solid rgba(255,255,255,0.05)"}}>
          <span style={{fontSize:10,color:"#2A3A55",fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",marginRight:4}}>Share</span>
          <button className="share-btn wa" onClick={shareWhatsApp} title="Share on WhatsApp">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.526 5.845L0 24l6.335-1.509A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.891 0-3.659-.494-5.187-1.357l-.371-.22-3.862.92.96-3.755-.242-.387A9.966 9.966 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
            WhatsApp
          </button>
          <button className="share-btn tw" onClick={shareTwitter} title="Share on X/Twitter">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            Post on X
          </button>
          <button className="share-btn" onClick={copyResults} title="Copy to clipboard" style={{borderColor:copied?"rgba(0,230,118,0.3)":"rgba(255,255,255,0.1)",color:copied?"#00E676":"#5A6A88",background:copied?"rgba(0,230,118,0.08)":"transparent"}}>
            {copied?"✓ Copied!":"📋 Copy"}
          </button>
        </div>
      </div>

      {/* DISCLAIMER */}
      <div style={{background:"rgba(255,184,0,0.04)",border:"1px solid rgba(255,184,0,0.1)",borderRadius:10,padding:"12px 16px",marginBottom:14,fontSize:11,color:"#4A4020",lineHeight:1.65}}>
        ⚠️ <strong style={{color:"#6A6030"}}>For entertainment only.</strong> Predictions are statistical estimates, not guaranteed outcomes. Never gamble more than you can afford to lose.
      </div>
    </div>
  );
}

// ── LOCAL STORAGE HELPERS ─────────────────────────────────────────────────────
// Wrapped in try/catch because Safari private mode throws on localStorage access
function lsGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function lsSet(key, val) { try { localStorage.setItem(key, val); } catch {} }

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  // Lazy initialisers read from localStorage once on mount.
  // "mp_onboarded" is set the moment the user completes onboarding — so they
  // never see it again on reload.  "mp_leagues" stores their league selection.
  const [showOnboarding,setShowOnboarding]=useState(()=>!lsGet("mp_onboarded"));
  const [selectedLeagues,setSelectedLeagues]=useState(()=>{
    const saved=lsGet("mp_leagues");
    if(saved){ try{ return JSON.parse(saved); }catch{} }
    return DEFAULT_LEAGUES;
  });
  const [showSettings,setShowSettings]=useState(false);
  const [showHistory,setShowHistory]=useState(false);
  const [showPrivacy,setShowPrivacy]=useState(false);
  const [history,setHistory]=useState([]);

  const [mode,setMode]=useState("clubs");
  const [phase,setPhase]=useState("input");
  const [homeTeam,setHomeTeam]=useState("");
  const [awayTeam,setAwayTeam]=useState("");
  const [venue,setVenue]=useState(1);
  const [homeData,setHomeData]=useState(null);
  const [awayData,setAwayData]=useState(null);
  const [prediction,setPrediction]=useState(null);
  const [inputError,setInputError]=useState("");
  const [homeEloOverride,setHomeEloOverride]=useState(null);
  const [awayEloOverride,setAwayEloOverride]=useState(null);
  const [fixtureChip,setFixtureChip]=useState(null);
  const [fixtureOrder,setFixtureOrder]=useState(null); // {home,away} canonical order when known
  const [copied,setCopied]=useState(false);
  const [loadMsg,setLoadMsg]=useState("Fetching Elo ratings...");
  const [homeForm,setHomeForm]=useState(null);
  const [awayForm,setAwayForm]=useState(null);

  const inputCardRef=useRef(null);

  const homeBonus=venue===1?100:venue===2?-100:0;
  const canPredict=homeTeam.trim()&&awayTeam.trim()&&homeTeam.toLowerCase()!==awayTeam.toLowerCase();
  const effectiveHomeElo=homeEloOverride??homeData?.elo??1500;
  const effectiveAwayElo=awayEloOverride??awayData?.elo??1500;

  // FIX BUG ③: Added homeBonus to deps — changing venue after results now live-updates prediction
  useEffect(()=>{
    if (phase==="results"&&homeData&&awayData)
      setPrediction(runPredict(effectiveHomeElo,effectiveAwayElo,homeBonus,homeForm?.formScore??0.5,awayForm?.formScore??0.5));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[homeEloOverride,awayEloOverride,homeBonus]);

  // FIX PERF ③: Stable handlePredict reference with useCallback
  const handlePredict=useCallback(async()=>{
    if (!canPredict){ setInputError("Please enter two different team names."); return; }
    setInputError(""); setLoadMsg("Fetching Elo ratings..."); setPhase("loading");
    const fetchFn=mode==="nations"?fetchNationElo:fetchClubElo;
    const [hd,ad]=await Promise.all([fetchFn(homeTeam,msg=>setLoadMsg(msg)),fetchFn(awayTeam,msg=>setLoadMsg(msg))]);
    setHomeData(hd); setAwayData(ad); setHomeEloOverride(null); setAwayEloOverride(null);
    setLoadMsg("Analysing recent form...");
    const [hForm,aForm]=await Promise.all([fetchTeamForm(homeTeam),fetchTeamForm(awayTeam)]);
    setHomeForm(hForm); setAwayForm(aForm);
    const pred=runPredict(hd.elo,ad.elo,homeBonus,hForm?.formScore??0.5,aForm?.formScore??0.5);
    setPrediction(pred); setPhase("results");
    const vStr=venue===1?`${homeTeam} at home`:venue===2?`${awayTeam} at home`:"Neutral";
    const entry={homeTeam,awayTeam,homeData:hd,awayData:ad,venue,venueStr:vStr,prediction:pred,mode,timestamp:Date.now()};
    setHistory(prev=>[entry,...prev].slice(0,30));
  },[canPredict,mode,homeTeam,awayTeam,homeBonus,venue]);

  useEffect(()=>{
    const handler=e=>{ if(e.key==="Enter"&&phase==="input"&&canPredict) handlePredict(); };
    window.addEventListener("keydown",handler);
    return()=>window.removeEventListener("keydown",handler);
  },[phase,canPredict,handlePredict]);

  const reset=useCallback(()=>{ setPhase("input");setPrediction(null);setHomeData(null);setAwayData(null);setInputError("");setHomeEloOverride(null);setAwayEloOverride(null);setFixtureChip(null);setFixtureOrder(null);setHomeForm(null);setAwayForm(null); },[]);
  const handleReplay=useCallback(entry=>{ setHomeTeam(entry.homeTeam);setAwayTeam(entry.awayTeam);setVenue(entry.venue);setMode(entry.mode||"clubs");setHomeData(entry.homeData);setAwayData(entry.awayData);setHomeEloOverride(null);setAwayEloOverride(null);setPrediction(entry.prediction);setPhase("results");setShowHistory(false); },[]);
  const handleFixtureSelect=useCallback((home,away,kickoff,league)=>{
    setHomeTeam(home); setAwayTeam(away); setVenue(1);
    setFixtureChip({kickoff,league});
    setFixtureOrder({home,away}); // remember canonical order for venue swapping
    setTimeout(()=>inputCardRef.current?.scrollIntoView({behavior:"smooth",block:"center"}),80);
  },[]);

  // FIX SECURITY ①: window.open with noopener,noreferrer prevents tabnapping
  const buildShareText=useCallback((format)=>{
    if (!prediction) return "";
    const {hw,d,aw,over25,btts,scores}=prediction;
    const top=scores[0];
    const homeWins=hw>aw&&hw>d,awayWins=aw>hw&&aw>d;
    const verdict=homeWins?`${homeTeam} Win`:awayWins?`${awayTeam} Win`:"Draw";
    const vp=homeWins?hw:awayWins?aw:d;
    if (format==="whatsapp") return `⚽ *${homeTeam} vs ${awayTeam}*\n🏆 Predicted: *${verdict}* (${(vp*100).toFixed(0)}%)\n📊 Most likely score: *${top.h}–${top.a}*\n📈 Over 2.5: ${(over25*100).toFixed(1)}% | BTTS: ${(btts*100).toFixed(1)}%\n\n_Free prediction by Match Predictor — try it yourself!_`;
    return `⚽ ${homeTeam} vs ${awayTeam}\n🏆 ${verdict} (${(vp*100).toFixed(0)}%)\n📊 Most likely: ${top.h}–${top.a}\n\nFree football predictions → Match Predictor by ClearView #football #prediction`;
  },[prediction,homeTeam,awayTeam]);

  const shareWhatsApp=useCallback(()=>{
    if(prediction) window.open(`https://wa.me/?text=${encodeURIComponent(buildShareText("whatsapp"))}`,"_blank","noopener,noreferrer");
  },[prediction,buildShareText]);
  const shareTwitter=useCallback(()=>{
    if(prediction) window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(buildShareText("twitter"))}`,"_blank","noopener,noreferrer");
  },[prediction,buildShareText]);
  const copyResults=useCallback(()=>{
    if (!prediction) return;
    navigator.clipboard.writeText(buildShareText("copy")).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2000); });
  },[prediction,buildShareText]);

  // Detect when manually typed names exactly match a FEATURED fixture (case-insensitive).
  // If they do, treat that pair as having a known canonical order so venue swapping works.
 useEffect(()=>{
    if (fixtureChip) return;
    setFixtureOrder(null);
  },[homeTeam,awayTeam,fixtureChip]);

  // Venue change: swap team inputs to match chosen home side when order is known
  const handleVenueChange=useCallback((v)=>{
    setVenue(v);
    if (!fixtureOrder) return;
    if (v===1) { setHomeTeam(fixtureOrder.home); setAwayTeam(fixtureOrder.away); }
    else if (v===2) { setHomeTeam(fixtureOrder.away); setAwayTeam(fixtureOrder.home); }
    // v===3 neutral: keep current names, just change the bonus
  },[fixtureOrder]);

  const venueStr=venue===1?`${homeTeam||"Home"} at home`:venue===2?`${awayTeam||"Away"} at home`:"Neutral venue";

  // Persist league choices whenever they change (settings save OR onboarding done)
  const saveLeagues=useCallback(leagues=>{
    setSelectedLeagues(leagues);
    lsSet("mp_leagues",JSON.stringify(leagues));
  },[]);

  if (showOnboarding) return <OnboardingScreen onDone={leagues=>{
    saveLeagues(leagues);
    lsSet("mp_onboarded","1");
    setShowOnboarding(false);
  }}/>;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow:wght@300;400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
        *{margin:0;padding:0;box-sizing:border-box;}
        html,body,#root{height:100%;background:#060A14;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes slideIn{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}
        @keyframes glow{0%,100%{box-shadow:0 6px 28px rgba(0,230,118,0.25)}50%{box-shadow:0 6px 36px rgba(0,230,118,0.45)}}
        .fu{animation:fadeUp 0.5s ease both}
        .fu1{animation:fadeUp 0.5s 0.07s ease both}
        .fu2{animation:fadeUp 0.5s 0.14s ease both}
        .fu3{animation:fadeUp 0.5s 0.21s ease both}
        .fu4{animation:fadeUp 0.5s 0.28s ease both}
        .fu5{animation:fadeUp 0.5s 0.35s ease both}
        .fu6{animation:fadeUp 0.5s 0.42s ease both}
        .predict-btn{background:linear-gradient(135deg,#00C060,#00E676);color:#000;border:none;padding:16px 44px;border-radius:11px;font-family:'Barlow',sans-serif;font-size:13px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;cursor:pointer;transition:transform 0.25s,box-shadow 0.25s;animation:glow 2.5s ease infinite;}
        .predict-btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 12px 40px rgba(0,230,118,0.45);}
        .predict-btn:active:not(:disabled){transform:translateY(0);}
        .predict-btn:disabled{opacity:0.35;cursor:not-allowed;animation:none;box-shadow:none;}
        .predict-btn:focus-visible{outline:2px solid #00E676;outline-offset:3px;}
        .venue-btn{padding:9px 18px;border-radius:8px;border:1px solid rgba(255,255,255,0.07);background:transparent;font-family:'Barlow',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;cursor:pointer;transition:all 0.22s;color:#4A5870;}
        .venue-btn.on{background:rgba(0,230,118,0.1);border-color:rgba(0,230,118,0.35);color:#00E676;}
        .venue-btn:hover:not(.on){border-color:rgba(255,255,255,0.14);color:#8898B8;}
        .mode-btn{padding:10px 22px;border-radius:9px;border:1px solid rgba(255,255,255,0.07);background:transparent;font-family:'Barlow',sans-serif;font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;transition:all 0.22s;color:#4A5870;}
        .mode-btn.on{background:rgba(77,158,255,0.12);border-color:rgba(77,158,255,0.4);color:#4D9EFF;}
        .mode-btn.on.nations{background:rgba(0,230,118,0.1);border-color:rgba(0,230,118,0.35);color:#00E676;}
        .ghost-btn{background:transparent;border:1px solid rgba(255,255,255,0.1);color:#5A6A88;padding:10px 22px;border-radius:9px;font-family:'Barlow',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;cursor:pointer;transition:all 0.22s;}
        .ghost-btn:hover{border-color:rgba(255,255,255,0.2);color:#A0B0C8;}
        .hist-btn{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:#5A6A88;padding:9px 16px;border-radius:9px;font-family:'Barlow',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;transition:all 0.22s;}
        .hist-btn:hover{border-color:rgba(255,255,255,0.18);color:#A0B0C8;}
        .share-btn{display:flex;align-items:center;gap:6px;padding:10px 18px;border-radius:9px;font-family:'Barlow',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;transition:all 0.22s;border:1px solid rgba(255,255,255,0.1);background:transparent;color:#5A6A88;}
        .share-btn:hover{transform:translateY(-1px);}
        .share-btn.wa:hover{border-color:rgba(37,211,102,0.4);color:#25D366;background:rgba(37,211,102,0.06);}
        .share-btn.tw:hover{border-color:rgba(29,161,242,0.4);color:#1DA1F2;background:rgba(29,161,242,0.06);}
        input[type="range"]{-webkit-appearance:none;appearance:none;height:4px;border-radius:2px;background:rgba(255,255,255,0.08);outline:none;}
        input[type="range"]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:var(--thumb-color,#00E676);cursor:pointer;border:2px solid #060A14;box-shadow:0 0 6px rgba(0,0,0,0.5);}
        input::placeholder{color:#2A3548}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-thumb{background:rgba(0,230,118,0.25);border-radius:2px}
        /* Focus-visible outline for keyboard navigation */
        button:focus-visible,a:focus-visible{outline:2px solid #00E676;outline-offset:2px;}
        /* MOBILE RESPONSIVE */
        @media(max-width:600px){
          .results-grid{grid-template-columns:1fr!important;}
          .results-grid2{grid-template-columns:1fr!important;}
          .elo-sliders{flex-direction:column!important;gap:16px!important;}
          .team-inputs{flex-direction:column!important;}
          .market-grid-4{grid-template-columns:repeat(2,1fr)!important;}
          /* FIX UX ⑤: was repeat(3,1fr) — a no-op; now collapses to 1 col on small screens */
          .market-grid-3{grid-template-columns:1fr!important;}
          .verdict-inner{flex-direction:column!important;align-items:center!important;text-align:center!important;}
          .header-btns{gap:6px!important;}
          .header-btns button{padding:7px 10px!important;font-size:9px!important;}
          .hero-title{font-size:40px!important;}
          .share-row{flex-wrap:wrap!important;}
        }
      `}</style>

      {showHistory&&<HistoryPanel history={history} onClose={()=>setShowHistory(false)} onReplay={handleReplay} onClear={()=>setHistory([])}/>}
      {showSettings&&<SettingsPanel selectedLeagues={selectedLeagues} onSave={saveLeagues} onClose={()=>setShowSettings(false)}/>}
      {showPrivacy&&<PrivacyModal onClose={()=>setShowPrivacy(false)}/>}

      <div style={{minHeight:"100vh",background:"radial-gradient(ellipse 90% 55% at 50% -5%,rgba(0,230,118,0.055) 0%,transparent 68%),linear-gradient(180deg,#060A14 0%,#08101E 100%)",padding:"28px 20px 64px",display:"flex",flexDirection:"column",alignItems:"center",fontFamily:"'Barlow',sans-serif"}}>

        {/* HEADER */}
        <div className="fu" style={{textAlign:"center",marginBottom:phase==="results"?20:32,width:"100%",maxWidth:760}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div style={{flex:1}}/>
            <div style={{flex:2,textAlign:"center"}}>
              <div style={{display:"inline-flex",alignItems:"center",gap:7,background:"rgba(0,230,118,0.07)",border:"1px solid rgba(0,230,118,0.15)",borderRadius:20,padding:"5px 14px",marginBottom:12}}>
                <span style={{width:6,height:6,borderRadius:"50%",background:"#00E676",boxShadow:"0 0 6px #00E676",display:"inline-block",animation:"pulse 2s infinite"}} aria-hidden="true"/>
                <span style={{fontSize:10,color:"#00A846",fontWeight:700,letterSpacing:"0.2em",textTransform:"uppercase"}}>Free · No Signup · Live Fixtures</span>
              </div>
              <div className="hero-title" style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:52,color:"#D8E2F0",letterSpacing:"0.06em",lineHeight:1,marginBottom:6}}>Match Predictor</div>
              <div style={{fontSize:13,color:"#4A6080",lineHeight:1.65,marginBottom:8}}>
                Predict any football match using <span style={{color:"#6A8A9A"}}>Elo ratings</span> + <span style={{color:"#6A8A9A"}}>Poisson modelling</span> — win probability, expected goals, scorelines & betting markets, instantly.
              </div>
              <div style={{fontSize:10,color:"#2A3A55"}}>Press <kbd style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:4,padding:"1px 6px",fontFamily:"'Space Mono',monospace",fontSize:9,color:"#3A5070"}}>Enter</kbd> to predict · Click any fixture to auto-fill</div>
            </div>
            <div className="header-btns" style={{flex:1,display:"flex",justifyContent:"flex-end",gap:8,paddingTop:8}}>
              <button className="hist-btn" onClick={()=>setShowSettings(true)} aria-label="Open settings">⚙ Settings</button>
              <button className="hist-btn" onClick={()=>setShowHistory(true)} aria-label={`Open history (${history.length} predictions)`}>🕐 History {history.length>0&&`(${history.length})`}</button>
            </div>
          </div>

          {phase==="input"&&(
            <div style={{display:"flex",justifyContent:"center",gap:20,flexWrap:"wrap",marginTop:14,paddingTop:14,borderTop:"1px solid rgba(255,255,255,0.04)"}}>
              {[["📊","Poisson + Dixon-Coles"],["🏆","30+ Leagues"],["⚡","Live Fixtures"],["🔒","Zero Data Stored"],["🌍","Clubs & Nations"]].map(([icon,label])=>(
                <div key={label} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"#2E4060"}}>
                  <span style={{fontSize:14}} aria-hidden="true">{icon}</span><span style={{fontWeight:600}}>{label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* INPUT PHASE */}
        {phase==="input"&&(
          <div style={{width:"100%",maxWidth:720}}>
            <div className="fu" style={{display:"flex",justifyContent:"center",gap:10,marginBottom:20}} role="group" aria-label="Prediction mode">
              <button className={`mode-btn${mode==="clubs"?" on":""}`} onClick={()=>setMode("clubs")} aria-pressed={mode==="clubs"}>🏟 Club Teams</button>
              <button className={`mode-btn nations${mode==="nations"?" on nations":""}`} onClick={()=>setMode("nations")} aria-pressed={mode==="nations"}>🌍 National Teams</button>
            </div>

            <div className="fu1" style={{marginBottom:6}}>
              <div style={{...LBL,marginBottom:14}}>📅 Upcoming Fixtures — click to auto-fill</div>
              <TodayMatches onSelect={handleFixtureSelect} selectedLeagues={selectedLeagues}/>
            </div>

            <Card ref={inputCardRef} id="team-input-card" className="fu2" style={{padding:28,marginBottom:16}}>
              {fixtureChip&&(
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16,padding:"7px 12px",background:"rgba(0,230,118,0.06)",border:"1px solid rgba(0,230,118,0.14)",borderRadius:8}}>
                  <LeaguePill league={fixtureChip.league}/>
                  <span style={{fontSize:11,color:"#4A6A50",fontWeight:600}}>Kickoff {fixtureChip.kickoff}</span>
                  <button onClick={()=>setFixtureChip(null)} aria-label="Dismiss fixture chip" style={{marginLeft:"auto",background:"transparent",border:"none",color:"#3A4A60",fontSize:12,cursor:"pointer"}}>✕</button>
                </div>
              )}
              <div className="team-inputs" style={{display:"flex",gap:20,alignItems:"flex-start"}}>
                <TeamInput label="Home Team" value={homeTeam} onChange={setHomeTeam} accentColor="#4D9EFF" placeholder={mode==="nations"?"e.g. France":"e.g. Arsenal"} mode={mode}/>
                <div style={{paddingTop:38,flexShrink:0}} aria-hidden="true">
                  <div style={{width:38,height:38,borderRadius:"50%",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Bebas Neue',sans-serif",fontSize:16,color:"#2E3D55"}}>VS</div>
                </div>
                <TeamInput label="Away Team" value={awayTeam} onChange={setAwayTeam} accentColor="#FF4D6D" placeholder={mode==="nations"?"e.g. Brazil":"e.g. Barcelona"} mode={mode}/>
              </div>
              <div style={{marginTop:24,paddingTop:20,borderTop:"1px solid rgba(255,255,255,0.05)"}}>
                <div style={{...LBL,marginBottom:12}}>Venue</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}} role="group" aria-label="Venue selection">
                  <button className={`venue-btn${venue===1?" on":""}`} onClick={()=>handleVenueChange(1)} aria-pressed={venue===1}>🏠 {homeTeam||"Home"} home</button>
                  <button className={`venue-btn${venue===2?" on":""}`} onClick={()=>handleVenueChange(2)} aria-pressed={venue===2}>🏠 {awayTeam||"Away"} home</button>
                  <button className={`venue-btn${venue===3?" on":""}`} onClick={()=>handleVenueChange(3)} aria-pressed={venue===3}>⚖ Neutral</button>
                </div>
              </div>
              {homeTeam&&awayTeam&&(
                <div style={{marginTop:16,padding:"10px 14px",background:"rgba(0,230,118,0.05)",border:"1px solid rgba(0,230,118,0.12)",borderRadius:9,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:13,fontWeight:700,color:"#CDD8EE"}}>{homeTeam} <span style={{color:"#2E3D55"}}>vs</span> {awayTeam}</span>
                  <button onClick={()=>{ setHomeTeam("");setAwayTeam("");setFixtureChip(null); }} aria-label="Clear team names" style={{background:"transparent",border:"none",color:"#3A4A60",fontSize:11,cursor:"pointer"}}>✕ clear</button>
                </div>
              )}
            </Card>

            {/* FIX UX ③: aria-live="polite" so screen readers announce the error */}
            <div aria-live="polite" aria-atomic="true">
              {inputError&&<div className="fu" style={{textAlign:"center",color:"#FF6B6B",fontSize:12,marginBottom:12,fontWeight:600}} role="alert">{inputError}</div>}
            </div>

            <div className="fu3" style={{display:"flex",justifyContent:"center",flexDirection:"column",alignItems:"center",gap:8}}>
              <button className="predict-btn" onClick={handlePredict} disabled={!canPredict} aria-label="Predict match outcome">
                ▶ Predict Match
              </button>
              {canPredict&&<div style={{fontSize:10,color:"#2A3A55"}}>or press <kbd style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:3,padding:"1px 5px",fontFamily:"'Space Mono',monospace",fontSize:9,color:"#3A4060"}}>Enter</kbd></div>}
              {!canPredict&&<div style={{fontSize:11,color:"#2A3A55"}}>Enter two different teams to unlock predictions</div>}
            </div>
          </div>
        )}

        {/* LOADING */}
        {phase==="loading"&&(
          <div style={{textAlign:"center",marginTop:56}} role="status" aria-live="polite" aria-label={loadMsg}>
            <div style={{width:56,height:56,margin:"0 auto 24px",border:"1.5px solid rgba(0,230,118,0.15)",borderTop:"1.5px solid #00E676",borderRadius:"50%",animation:"spin 0.9s linear infinite"}} aria-hidden="true"/>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:"#C0CCD8",letterSpacing:"0.1em"}}>{loadMsg}</div>
            <div style={{fontSize:12,color:"#2E3D55",marginTop:8,animation:"pulse 2s infinite"}} aria-hidden="true">{mode==="nations"?"Loading from eloratings.net database...":"Connecting to clubelo.com via proxy..."}</div>
          </div>
        )}

        {/* RESULTS — FIX ⑥: proper component, not IIFE */}
        {phase==="results"&&prediction&&homeData&&awayData&&(
          <ResultsView
            prediction={prediction}
            homeTeam={homeTeam} awayTeam={awayTeam}
            homeData={homeData} awayData={awayData}
            homeForm={homeForm} awayForm={awayForm}
            effectiveHomeElo={effectiveHomeElo} effectiveAwayElo={effectiveAwayElo}
            setHomeEloOverride={setHomeEloOverride} setAwayEloOverride={setAwayEloOverride}
            mode={mode} venueStr={venueStr} copied={copied}
            reset={reset} shareWhatsApp={shareWhatsApp} shareTwitter={shareTwitter} copyResults={copyResults}
          />
        )}

        {/* FOOTER */}
        <div style={{marginTop:36,fontSize:10,color:"#1C2636",letterSpacing:"0.07em",textAlign:"center",lineHeight:2}}>
          Club data © clubelo.com · Nation data © eloratings.net · Poisson model with Dixon-Coles correction<br/>
          <span style={{color:"#162030"}}>Made by ClearView · Purely Tech. Purely Free.</span><br/>
          <button onClick={()=>setShowPrivacy(true)}
            style={{background:"transparent",border:"none",color:"#2A3A55",fontSize:10,cursor:"pointer",textDecoration:"underline",textUnderlineOffset:3,fontFamily:"'Barlow',sans-serif",letterSpacing:"0.07em",padding:0,marginTop:4}}>
            Privacy Policy
          </button>
        </div>
      </div>
    </>
  );
}