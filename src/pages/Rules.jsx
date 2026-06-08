export default function Rules({ onClose }) {
  const sections = [
    {
      num: "1",
      title: "Scoring",
      body: "1 point for each correct match prediction. A prediction is correct if you predict the right outcome: Home Team Win, Draw, or Away Team Win.",
    },
    {
      num: "2",
      title: "Submission Rules",
      body: "Predictions must be submitted before the tournament begins",
    },
    {
      num: "3",
      title: "Standings",
      body: "Participants are ranked by total points earned. The participant with the most points at the end of the tournament wins.",
    },
    {
      num: "4",
      title: "Tiebreaker",
      body: "If two or more participants finish with the same number of points: (1) Most correct knockout-stage predictions. (2) Correct prediction of the tournament champion. (3) Earliest submission time for the final predictions.",
    },
    {
      num: "5",
      title: "Knockout Matches",
      body: "Predictions are based on the team that advances to the next round. Predictions after regular time, extra time, or penalties all count as correct if the advancing team is correctly selected.",
    },
    {
      num: "6",
      title: "Fair Play",
      body: "One entry per participant. Any attempt to submit predictions after kickoff will result in those predictions being void.",
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,2,26,0.92)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl"
        style={{
          background: "linear-gradient(160deg, #1f0645 0%, #160336 100%)",
          border: "1px solid rgba(200,240,0,0.12)",
          boxShadow: "0 0 60px rgba(200,240,0,0.06), 0 24px 80px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div
          className="sticky top-0 px-8 pt-8 pb-6"
          style={{
            background: "linear-gradient(160deg, #1f0645 0%, #1a0533 100%)",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center rounded-full transition-colors"
            style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.4)" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.14)"; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
            aria-label="Close"
          >
            ✕
          </button>

          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.3)" }}>
            Official Rules
          </p>

          <h2
            className="text-white leading-none"
            style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(1.8rem,5vw,2.8rem)", letterSpacing: "0.04em" }}
          >
            World Cup Prediction
          </h2>
          <h2
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: "clamp(1.8rem,5vw,2.8rem)",
              letterSpacing: "0.04em",
              lineHeight: 1,
              background: "linear-gradient(90deg, #c8f000, #a3e635)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            League Rules
          </h2>

          {/* Simple version callout */}
          <div className="mt-4 px-4 py-3 rounded-xl" style={{ background: "rgba(200,240,0,0.06)", border: "1px solid rgba(200,240,0,0.12)" }}>
            <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "#c8f000" }}>Simple Version</p>
            <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
              1 point for every correctly predicted match result (win, loss, or draw). Predictions must be submitted before tournament begins.
            </p>
          </div>
        </div>

        {/* Sections */}
        <div className="px-8 py-6 flex flex-col gap-5">
          {sections.map((s) => (
            <div
              key={s.num}
              className="flex gap-4"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "1.25rem" }}
            >
              <div
                className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black mt-0.5"
                style={{ background: "rgba(200,240,0,0.1)", color: "#c8f000", border: "1px solid rgba(200,240,0,0.2)" }}
              >
                {s.num}
              </div>
              <div>
                <p className="font-bold mb-1 text-sm uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.85)" }}>
                  {s.title}
                </p>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
                  {s.body}
                </p>
              </div>
            </div>
          ))}

          <p className="text-xs text-center pb-2" style={{ color: "rgba(255,255,255,0.2)" }}>
            This is a private friendly challenge and is not affiliated with FIFA or any official body.
          </p>
        </div>
      </div>
    </div>
  );
}
