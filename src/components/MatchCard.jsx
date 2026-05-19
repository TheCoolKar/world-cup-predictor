import { predictMatch } from "../utils/Predictions";
import eloRatings from "../data/elo_ratings.json";
import teamForm from "../data/team_form.json";

const FLAG_CODES = {
  "Mexico": "mx", "South Africa": "za", "South Korea": "kr", "Czechia": "cz",
  "Canada": "ca", "Qatar": "qa", "Switzerland": "ch", "Bosnia and Herzegovina": "ba",
  "Brazil": "br", "Morocco": "ma", "Haiti": "ht", "Scotland": "gb-sct",
  "USA": "us", "Paraguay": "py", "Australia": "au", "Türkiye": "tr",
  "Germany": "de", "Curaçao": "cw", "Ivory Coast": "ci", "Ecuador": "ec",
  "Netherlands": "nl", "Japan": "jp", "Sweden": "se", "Tunisia": "tn",
  "Belgium": "be", "Egypt": "eg", "Iran": "ir", "New Zealand": "nz",
  "Spain": "es", "Cape Verde": "cv", "Saudi Arabia": "sa", "Uruguay": "uy",
  "France": "fr", "Senegal": "sn", "Norway": "no", "Iraq": "iq",
  "Argentina": "ar", "Algeria": "dz", "Austria": "at", "Jordan": "jo",
  "Portugal": "pt", "DR Congo": "cd", "Uzbekistan": "uz", "Colombia": "co",
  "England": "gb-eng", "Croatia": "hr", "Ghana": "gh", "Panama": "pa",
};

function FlagEmoji({ country }) {
  const code = FLAG_CODES[country];
  if (!code) return <span className="text-2xl">🏳️</span>;
  if (code === "gb-sct") return <span className="text-2xl leading-none">🏴󠁧󠁢󠁳󠁣󠁴󠁿</span>;
  if (code === "gb-eng") return <span className="text-2xl leading-none">🏴󠁧󠁢󠁥󠁮󠁧󠁿</span>;
  const flag = code.toUpperCase().split("").map((c) =>
    String.fromCodePoint(0x1f1e6 - 65 + c.charCodeAt(0))
  ).join("");
  return <span className="text-2xl leading-none">{flag}</span>;
}

function FormDots({ form }) {
  if (!form) return null;
  return (
    <div className="flex gap-0.5 justify-center mt-1">
      {form.split("").map((r, i) => (
        <span
          key={i}
          className={`w-2 h-2 rounded-full ${
            r === "W" ? "bg-green-500" : r === "D" ? "bg-yellow-400" : "bg-red-400"
          }`}
          title={r === "W" ? "Win" : r === "D" ? "Draw" : "Loss"}
        />
      ))}
    </div>
  );
}

export default function MatchCard({ match }) {
  const { home, away, date, time, city, matchday } = match;

  const eloHome = eloRatings[home];
  const eloAway = eloRatings[away];
  const formHome = teamForm[home] ?? null;
  const formAway = teamForm[away] ?? null;

  const prediction = eloHome && eloAway
    ? predictMatch(eloHome, eloAway, formHome, formAway)
    : null;

  const homePct = prediction?.homeWin ?? 50;
  const awayPct = prediction?.awayWin ?? 50;
  const isFavoriteHome = homePct >= awayPct;

  const formattedDate = new Date(date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });

  return (
    <div className="bg-white rounded-2xl shadow-md hover:shadow-lg transition-shadow duration-200 overflow-hidden border border-gray-100">
      {/* Top bar */}
      <div className="bg-gradient-to-r from-green-700 to-green-600 px-4 py-2 flex justify-between items-center">
        <span className="text-xs font-semibold text-green-100 uppercase tracking-wide">
          Matchday {matchday}
        </span>
        <div className="flex items-center gap-2">
          {prediction?.usedForm && (
            <span className="text-xs bg-green-500 text-white px-1.5 py-0.5 rounded font-medium">
              + Form
            </span>
          )}
          <span className="text-xs text-green-200">{formattedDate}</span>
        </div>
      </div>

      {/* Teams */}
      <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
        {/* Home */}
        <div className="flex flex-col items-center gap-1 flex-1">
          <FlagEmoji country={home} />
          <span className={`text-sm font-bold text-center leading-tight ${isFavoriteHome ? "text-green-700" : "text-gray-700"}`}>
            {home}
          </span>
          {prediction && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isFavoriteHome ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
              {homePct.toFixed(1)}%
            </span>
          )}
          <FormDots form={formHome?.recentForm} />
        </div>

        {/* VS */}
        <div className="flex flex-col items-center shrink-0 pt-1">
          <span className="text-base font-black text-gray-300">VS</span>
          {time && <span className="text-xs text-gray-400 mt-0.5">{time}</span>}
        </div>

        {/* Away */}
        <div className="flex flex-col items-center gap-1 flex-1">
          <FlagEmoji country={away} />
          <span className={`text-sm font-bold text-center leading-tight ${!isFavoriteHome ? "text-green-700" : "text-gray-700"}`}>
            {away}
          </span>
          {prediction && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${!isFavoriteHome ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
              {awayPct.toFixed(1)}%
            </span>
          )}
          <FormDots form={formAway?.recentForm} />
        </div>
      </div>

      {/* Probability bar */}
      {prediction && (
        <div className="px-5 pb-4">
          <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-100">
            <div className="bg-green-500 rounded-l-full" style={{ width: `${homePct}%` }} />
            <div className="bg-blue-400 rounded-r-full" style={{ width: `${awayPct}%` }} />
          </div>
        </div>
      )}

      {/* Venue */}
      {city && (
        <div className="px-5 pb-3 flex items-center gap-1.5">
          <svg className="w-3 h-3 text-gray-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
          </svg>
          <span className="text-xs text-gray-400 truncate">{city}</span>
        </div>
      )}
    </div>
  );
}
