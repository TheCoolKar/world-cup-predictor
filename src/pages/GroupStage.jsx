import fixtures from "../data/wc2026_fixtures.json";
import MatchCard from "../components/MatchCard";

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

export default function GroupStage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-gray-800">Group Stage</h1>
        <p className="text-gray-400 mt-1 text-sm">Win probabilities calculated using ELO ratings · June 11 – June 27, 2026</p>
      </div>

      <div className="flex flex-col gap-12">
        {GROUPS.map((group) => {
          const matches = fixtures.filter((m) => m.group === group);
          if (!matches.length) return null;

          const teams = [...new Set(matches.flatMap((m) => [m.home, m.away]))];

          return (
            <section key={group}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg bg-green-700 flex items-center justify-center shrink-0">
                  <span className="text-white font-black text-sm">{group}</span>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-800 leading-none">Group {group}</h2>
                  <p className="text-xs text-gray-400 mt-0.5">{teams.join(" · ")}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {matches.map((match) => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
