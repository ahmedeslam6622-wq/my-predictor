import { useState, useEffect } from "react";

const LEAGUE_META = {
  "English Premier League":    { short:"EPL",      color:"#3D195B", text:"#E0AAFF" },
  "Spanish La Liga":           { short:"La Liga",   color:"#C60B1E", text:"#FFD700" },
  "German Bundesliga":         { short:"Bundesliga",color:"#D00000", text:"#FFFFFF" },
  "Italian Serie A":           { short:"Serie A",   color:"#009246", text:"#FFFFFF" },
  "French Ligue 1":            { short:"Ligue 1",   color:"#002654", text:"#FFFFFF" },
  "UEFA Champions League":     { short:"UCL",       color:"#0A1464", text:"#FFD700" },
  "UEFA Europa League":        { short:"UEL",       color:"#F77F00", text:"#FFFFFF" },
  "UEFA Conference League":    { short:"UECL",      color:"#00A651", text:"#FFFFFF" },
  "Dutch Eredivisie":          { short:"Eredivisie",color:"#E0421B", text:"#FFFFFF" },
  "Portuguese Primeira Liga":  { short:"Primeira",  color:"#006600", text:"#FFD700" },
  "Scottish Premiership":      { short:"SPL",       color:"#003DA5", text:"#FFFFFF" },
  "Turkish Süper Lig":         { short:"Süper Lig", color:"#E30A17", text:"#FFFFFF" },
  "Major League Soccer":       { short:"MLS",       color:"#002B5C", text:"#91C4F2" },
  "Brazilian Série A":         { short:"Brasileirão",color:"#009C3B",text:"#FFD700" },
  "Argentine Primera División":{ short:"Liga Prof.", color:"#74ACDF", text:"#FFFFFF" },
  "Saudi Professional League": { short:"SPL",       color:"#006C35", text:"#FFFFFF" },
  "Egyptian Premier League":   { short:"EPL EGY",   color:"#C8102E", text:"#FFFFFF" },
};

const KNOWN_LEAGUES = new Set(Object.keys(LEAGUE_META));

// thesportsdb free API — no key needed
async function fetchMatches(dateStr) {
  const ESPN_MAP = {
    "English Premier League":    { sport:"soccer", slug:"eng.1" },
    "Spanish La Liga":           { sport:"soccer", slug:"esp.1" },
    "German Bundesliga":         { sport:"soccer", slug:"ger.1" },
    "Italian Serie A":           { sport:"soccer", slug:"ita.1" },
    "French Ligue 1":            { sport:"soccer", slug:"fra.1" },
    "UEFA Champions League":     { sport:"soccer", slug:"uefa.champions" },
    "UEFA Europa League":        { sport:"soccer", slug:"uefa.europa" },
    "Dutch Eredivisie":          { sport:"soccer", slug:"ned.1" },
    "Portuguese Primeira Liga":  { sport:"soccer", slug:"por.1" },
    "Scottish Premiership":      { sport:"soccer", slug:"sco.1" },
    "Turkish Süper Lig":         { sport:"soccer", slug:"tur.1" },
    "Major League Soccer":       { sport:"soccer", slug:"usa.1" },
    "Brazilian Série A":         { sport:"soccer", slug:"bra.1" },
    "Argentine Primera División":{ sport:"soccer", slug:"arg.1" },
  };

  const d = dateStr.replace(/-/g, "");
  const results = [];

  await Promise.all(
    Object.entries(ESPN_MAP).map(async ([league, { sport, slug }]) => {
      try {
        const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${slug}/scoreboard?dates=${d}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const json = await res.json();
        for (const ev of (json.events || [])) {
          const comp = ev.competitions?.[0];
          const home = comp?.competitors?.find(c => c.homeAway === "home");
          const away = comp?.competitors?.find(c => c.homeAway === "away");
          const state = ev.status?.type?.state;
          const completed = ev.status?.type?.completed;
          const hasScore = completed || state === "in";
          results.push({
            strHomeTeam:  home?.team?.displayName || "?",
            strAwayTeam:  away?.team?.displayName || "?",
            intHomeScore: hasScore ? (home?.score ?? null) : null,
            intAwayScore: hasScore ? (away?.score ?? null) : null,
            strStatus:    completed ? "Match Finished" : state === "in" ? "In Progress" : "",
            strTime:      ev.date,
            strLeague:    league,
          });
        }
      } catch { /* skip failed league */ }
    })
  );

  return results;
}

function formatTime(str) {
  if (!str) return "TBD";
  // str is like "20:45:00" UTC — convert to local
  try {
    const [h, m] = str.split(":");
    const d = new Date();
    d.setUTCHours(parseInt(h), parseInt(m), 0);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch { return str.slice(0,5); }
}

function formatDate(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const today = new Date();
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
  if (dateStr === today.toISOString().slice(0,10)) return "Today";
  if (dateStr === tomorrow.toISOString().slice(0,10)) return "Tomorrow";
  return d.toLocaleDateString([], { weekday:"short", month:"short", day:"numeric" });
}

function getDateRange(days = 5) {
  const dates = [];
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function LeagueBadge({ league }) {
  const meta = LEAGUE_META[league] || { short: league.slice(0,8), color:"#1A2A40", text:"#8898B8" };
  return (
    <span style={{
      background: meta.color,
      color: meta.text,
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: "0.08em",
      padding: "2px 7px",
      borderRadius: 4,
      textTransform: "uppercase",
      flexShrink: 0,
      display: "inline-block",
    }}>{meta.short}</span>
  );
}

function MatchCard({ event, onSelect }) {
  const [hovered, setHovered] = useState(false);
  const isFinished = event.strStatus === "Match Finished" || event.intHomeScore !== null;
  const homeScore = event.intHomeScore;
  const awayScore = event.intAwayScore;

  return (
    <div
      onClick={() => !isFinished && onSelect(event.strHomeTeam, event.strAwayTeam)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered && !isFinished
          ? "rgba(0,230,118,0.06)"
          : "rgba(255,255,255,0.02)",
        border: `1px solid ${hovered && !isFinished
          ? "rgba(0,230,118,0.2)"
          : "rgba(255,255,255,0.06)"}`,
        borderRadius: 14,
        padding: "14px 16px",
        cursor: isFinished ? "default" : "pointer",
        transition: "all 0.2s",
        minWidth: 220,
        flexShrink: 0,
        position: "relative",
        opacity: isFinished ? 0.6 : 1,
      }}
    >
      {/* League badge + time */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <LeagueBadge league={event.strLeague} />
        <span style={{
          fontSize: 10,
          fontFamily: "'Space Mono',monospace",
          color: isFinished ? "#FF6B6B" : "#00A846",
          fontWeight: 700,
        }}>
          {isFinished ? "FT" : formatTime(event.strTime)}
        </span>
      </div>

      {/* Teams + score */}
      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
        {[
          { name: event.strHomeTeam, score: homeScore },
          { name: event.strAwayTeam, score: awayScore },
        ].map((team, i) => (
          <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8 }}>
            <span style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#CDD8EE",
              overflow:"hidden",
              whiteSpace:"nowrap",
              textOverflow:"ellipsis",
              maxWidth: 140,
              fontFamily:"'Barlow',sans-serif",
            }}>{team.name}</span>
            {isFinished && (
              <span style={{
                fontFamily:"'Space Mono',monospace",
                fontSize: 14,
                fontWeight: 700,
                color: "#D8E2F0",
                flexShrink: 0,
              }}>{team.score ?? "–"}</span>
            )}
          </div>
        ))}
      </div>

      {/* Predict badge */}
      {!isFinished && hovered && (
        <div style={{
          position:"absolute", bottom:8, right:10,
          fontSize:9, color:"#00C864", fontWeight:700,
          letterSpacing:"0.1em", textTransform:"uppercase",
        }}>▶ Predict</div>
      )}
    </div>
  );
}

export default function TodayMatches({ onSelect }) {
  const dates = getDateRange(5);
  const [activeDate, setActiveDate] = useState(dates[0]);
  const [matchesByDate, setMatchesByDate] = useState({});
  const [loading, setLoading] = useState({});

  useEffect(() => {
    dates.forEach(async (date) => {
      if (matchesByDate[date] !== undefined) return;
      setLoading(p => ({ ...p, [date]: true }));
      const matches = await fetchMatches(date);
      setMatchesByDate(p => ({ ...p, [date]: matches }));
      setLoading(p => ({ ...p, [date]: false }));
    });
  }, []);

  const matches = matchesByDate[activeDate] || [];
  const isLoading = loading[activeDate];

  // Group by league
  const grouped = matches.reduce((acc, m) => {
    if (!acc[m.strLeague]) acc[m.strLeague] = [];
    acc[m.strLeague].push(m);
    return acc;
  }, {});

  return (
    <div style={{ width:"100%", marginBottom:22 }}>
      {/* Date tabs */}
      <div style={{ display:"flex", gap:8, marginBottom:16, overflowX:"auto", paddingBottom:4 }}>
        {dates.map(date => (
          <button
            key={date}
            onClick={() => setActiveDate(date)}
            style={{
              flexShrink:0,
              padding:"8px 16px",
              borderRadius:8,
              border:`1px solid ${activeDate===date
                ? "rgba(0,230,118,0.4)"
                : "rgba(255,255,255,0.07)"}`,
              background: activeDate===date
                ? "rgba(0,230,118,0.1)"
                : "rgba(255,255,255,0.02)",
              color: activeDate===date ? "#00E676" : "#4A5870",
              fontSize:11,
              fontWeight:700,
              letterSpacing:"0.1em",
              textTransform:"uppercase",
              cursor:"pointer",
              transition:"all 0.2s",
              fontFamily:"'Barlow',sans-serif",
            }}
          >
            {formatDate(date)}
            {matchesByDate[date] !== undefined && (
              <span style={{
                marginLeft:6,
                background: activeDate===date
                  ? "rgba(0,230,118,0.2)"
                  : "rgba(255,255,255,0.06)",
                borderRadius:4,
                padding:"1px 5px",
                fontSize:9,
                color: activeDate===date ? "#00C864" : "#3A4A60",
              }}>{matchesByDate[date].length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading && (
        <div style={{ textAlign:"center", padding:"28px 0", color:"#2E3D55", fontSize:12 }}>
          <div style={{
            width:24, height:24, margin:"0 auto 10px",
            border:"1.5px solid rgba(0,230,118,0.15)",
            borderTop:"1.5px solid #00E676",
            borderRadius:"50%",
            animation:"spin 0.85s linear infinite",
          }}/>
          Loading fixtures...
        </div>
      )}

      {!isLoading && matches.length === 0 && (
        <div style={{ textAlign:"center", padding:"22px 0", color:"#2E3D55", fontSize:12 }}>
          No major league fixtures found for {formatDate(activeDate)}.
        </div>
      )}

      {!isLoading && matches.length > 0 && (
        <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
          {Object.entries(grouped).map(([league, games]) => (
            <div key={league}>
              {/* League header */}
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                <LeagueBadge league={league} />
                <span style={{
                  fontSize:11, color:"#3A4A60", fontWeight:600,
                  letterSpacing:"0.06em", fontFamily:"'Barlow',sans-serif",
                }}>{league}</span>
                <div style={{ flex:1, height:"1px", background:"rgba(255,255,255,0.04)" }}/>
              </div>
              {/* Cards row */}
              <div style={{
                display:"flex", gap:10,
                overflowX:"auto", paddingBottom:6,
              }}>
                {games.map((event, i) => (
                  <MatchCard key={i} event={event} onSelect={onSelect} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}