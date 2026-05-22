import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const TOTAL_MATCHES = 48;

export default function Admin({ onClose }) {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [sort,    setSort]    = useState("submitted_at");
  const [asc,     setAsc]     = useState(false);

  useEffect(() => {
    supabase
      .from("submissions")
      .select("id, email, display_name, group_picks_count, submitted_at, updated_at")
      .order(sort, { ascending: asc })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setRows(data ?? []);
        setLoading(false);
      });
  }, [sort, asc]);

  function toggleSort(col) {
    if (sort === col) setAsc(p => !p);
    else { setSort(col); setAsc(false); }
  }

  const th = (label, col) => (
    <th
      onClick={() => toggleSort(col)}
      className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider cursor-pointer select-none"
      style={{ color: sort === col ? "#c8f000" : "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}
    >
      {label} {sort === col ? (asc ? "↑" : "↓") : ""}
    </th>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,2,26,0.95)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(160deg, #1f0645 0%, #160336 100%)",
          border: "1px solid rgba(200,240,0,0.12)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
        }}
      >
        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-0.5" style={{ color: "#c8f000" }}>
              Organizer View
            </p>
            <h2
              className="text-white leading-none"
              style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.8rem", letterSpacing: "0.04em" }}
            >
              Bracket Submissions
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-2xl font-black" style={{ color: "#c8f000", fontFamily: "'Bebas Neue', sans-serif" }}>
                {rows.length}
              </p>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>entries</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
              style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.4)" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.14)"; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
            >✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>Loading submissions…</p>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-40">
              <p className="text-sm" style={{ color: "#ef4444" }}>{error}</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <span className="text-3xl">📭</span>
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>No submissions yet.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead style={{ background: "rgba(255,255,255,0.03)", position: "sticky", top: 0 }}>
                <tr>
                  {th("Name", "display_name")}
                  {th("Email", "email")}
                  {th("Group Picks", "group_picks_count")}
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider"
                    style={{ color: "rgba(255,255,255,0.4)" }}>Complete?</th>
                  {th("Submitted", "submitted_at")}
                  {th("Last Update", "updated_at")}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const complete = row.group_picks_count >= TOTAL_MATCHES;
                  return (
                    <tr key={row.id}
                      style={{ borderTop: "1px solid rgba(255,255,255,0.05)", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                      <td className="px-4 py-3 font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>
                        {row.display_name || "—"}
                      </td>
                      <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.5)" }}>
                        {row.email}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-black" style={{ color: complete ? "#c8f000" : "#f59e0b" }}>
                          {row.group_picks_count}
                        </span>
                        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.7rem" }}>
                          /{TOTAL_MATCHES}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="text-xs font-bold px-2 py-0.5 rounded-full"
                          style={{
                            background: complete ? "rgba(200,240,0,0.1)" : "rgba(245,158,11,0.1)",
                            color: complete ? "#c8f000" : "#f59e0b",
                            border: `1px solid ${complete ? "rgba(200,240,0,0.2)" : "rgba(245,158,11,0.2)"}`,
                          }}
                        >
                          {complete ? "✓ Full" : "Partial"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                        {new Date(row.submitted_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                        {new Date(row.updated_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 shrink-0 text-xs" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.2)" }}>
          To export all data or view full bracket picks, use the Supabase dashboard with the service-role key.
        </div>
      </div>
    </div>
  );
}
