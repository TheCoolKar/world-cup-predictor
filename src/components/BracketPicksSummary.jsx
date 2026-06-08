import { getFlagClass } from "../utils/flags";

function TeamFlag({ name }) {
  if (!name) return null;
  const cls = getFlagClass(name);
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>
      {cls && <span className={cls} style={{ fontSize: "0.85rem" }} />}
      {name}
    </span>
  );
}

export default function BracketPicksSummary({ champion, finalist, third, semis = [] }) {
  const hasKnockout = champion || finalist;

  if (!hasKnockout) {
    return <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>Group picks only — no knockout picks yet</span>;
  }

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {champion && (
        <div className="flex items-center gap-1">
          <span style={{ fontSize: "0.8rem" }}>🥇</span>
          <TeamFlag name={champion} />
        </div>
      )}
      {finalist && finalist !== champion && (
        <div className="flex items-center gap-1">
          <span style={{ fontSize: "0.8rem" }}>🥈</span>
          <TeamFlag name={finalist} />
        </div>
      )}
      {semis.filter(t => t && t !== champion && t !== finalist).map(team => (
        <div key={team} className="flex items-center gap-1">
          <span style={{ fontSize: "0.8rem" }}>🥈</span>
          <TeamFlag name={team} />
        </div>
      ))}
      {third && third !== champion && third !== finalist && (
        <div className="flex items-center gap-1">
          <span style={{ fontSize: "0.8rem" }}>🥉</span>
          <TeamFlag name={third} />
        </div>
      )}
    </div>
  );
}
