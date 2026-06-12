/**
 * LiveMatchPanel.jsx — event timeline for a live or finished match.
 *
 * Renders goals ⚽, cards 🟨🟥, and substitutions 🔁 from match_events rows
 * (written by the FotMob poller, delivered via useLiveFeed). Home events
 * align left, away events align right, half-time shown as a divider.
 */

const TYPE_ICON = {
  Goal: "⚽",
  Substitution: "🔁",
};

function cardIcon(card) {
  if (card === "Red" || card === "YellowRed") return "🟥";
  return "🟨";
}

function minuteLabel(e) {
  if (e.minute == null) return "";
  return e.overload ? `${e.minute}+${e.overload}'` : `${e.minute}'`;
}

function EventRow({ event }) {
  const icon = event.type === "Card" ? cardIcon(event.card) : TYPE_ICON[event.type];
  const homeSide = event.is_home === true;

  return (
    <div className={`flex items-center gap-2 ${homeSide ? "" : "flex-row-reverse"}`}>
      <span className="text-xs font-black tabular-nums shrink-0 w-10"
        style={{ color: "rgba(255,255,255,0.35)", textAlign: homeSide ? "right" : "left" }}>
        {minuteLabel(event)}
      </span>
      <span className="text-sm leading-none shrink-0">{icon}</span>
      <div className={`min-w-0 ${homeSide ? "text-left" : "text-right"}`}>
        <p className="text-xs font-semibold truncate"
          style={{ color: event.type === "Goal" ? "#c8f000" : "rgba(255,255,255,0.8)" }}>
          {event.type === "Substitution" ? (event.detail ?? event.player) : event.player}
        </p>
        {event.type === "Goal" && (event.assist || event.detail) && (
          <p className="text-xs truncate" style={{ color: "rgba(255,255,255,0.35)" }}>
            {[event.assist ? `assist: ${event.assist}` : null, event.detail].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}

export default function LiveMatchPanel({ live, events = [] }) {
  const visible = events.filter(e => ["Goal", "Card", "Substitution", "Half"].includes(e.type));
  if (!visible.length && !live) return null;

  return (
    <div className="rounded-xl p-4"
      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>

      {/* Status line */}
      {live && (
        <div className="flex items-center gap-2 mb-3">
          {(live.status === "LIVE" || live.status === "HT") && (
            <span className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: "#22c55e", animation: "pulse 1.5s ease-in-out infinite" }} />
          )}
          <span className="text-xs font-black uppercase tracking-widest"
            style={{ color: live.status === "LIVE" || live.status === "HT" ? "#22c55e" : "rgba(255,255,255,0.4)" }}>
            {live.status === "LIVE" ? `Live · ${live.minute ?? ""}` : live.status === "HT" ? "Half-Time" : live.status}
          </span>
        </div>
      )}

      {/* Timeline */}
      {visible.length ? (
        <div className="flex flex-col gap-1.5">
          {visible.map(e =>
            e.type === "Half" ? (
              <div key={e.seq} className="flex items-center gap-2 my-1">
                <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.07)" }} />
                <span className="text-xs font-bold uppercase" style={{ color: "rgba(255,255,255,0.3)" }}>HT</span>
                <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.07)" }} />
              </div>
            ) : (
              <EventRow key={e.seq} event={e} />
            )
          )}
        </div>
      ) : (
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>No events yet.</p>
      )}
    </div>
  );
}
