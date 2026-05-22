export default function Rules({ onClose }) {
  const sections = [
    {
      num: "1",
      title: "Organizer",
      body: "This challenge is organized by a private individual for entertainment purposes among friends, family, and invited participants. It is not affiliated with FIFA, the FIFA World Cup™, or any official tournament body.",
    },
    {
      num: "2",
      title: "Eligibility",
      body: "The challenge is open to all participants who have been personally invited by the organizer. Participants must be 18 years of age or older. The organizer and immediate family members residing in the same household are not eligible to win.",
    },
    {
      num: "3",
      title: "Competition Format",
      body: "Each participant must predict the outcome (Win / Draw / Loss) for every group stage match of the 2026 FIFA World Cup. There are 12 groups (A–L), each containing 4 teams, with each team playing 3 matches — for a total of 48 group stage matches. All predictions must be submitted before the deadline.",
    },
    {
      num: "4",
      title: "Submission Deadline",
      body: "All predictions must be submitted before the kick-off of the first group stage match of the 2026 FIFA World Cup. Any picks submitted after the tournament begins will not be counted.",
    },
    {
      num: "5",
      title: "Winning Criteria",
      body: "The participant who correctly predicts the most group stage match results (Win / Draw / Loss) wins the prize. In the event of a tie, the prize will be split equally among all tied participants.",
    },
    {
      num: "6",
      title: "Match Result Determination",
      body: "All results are based on the official 90-minute full-time result. Extra time and penalty shootouts are not applicable to the group stage.",
    },
    {
      num: "7",
      title: "Prize",
      body: "The prize is $1,000 CAD, paid via e-transfer to the winner(s) within 14 days of the final group stage match being played.",
    },
    {
      num: "8",
      title: "Multiple Winners",
      body: "If two or more participants finish with the same number of correct predictions, the $1,000 CAD prize will be divided equally among all tied winners.",
    },
    {
      num: "9",
      title: "Disqualification",
      body: "Any participant found to have submitted duplicate entries, manipulated their picks after the deadline, or engaged in any form of cheating will be immediately disqualified.",
    },
    {
      num: "10",
      title: "Liability",
      body: "The organizer is not responsible for any technical issues that prevent a participant from submitting their picks before the deadline. It is the participant's responsibility to ensure their predictions are submitted on time.",
    },
    {
      num: "11",
      title: "Final Decision",
      body: "The organizer's decision on all matters relating to this challenge, including disputes, is final and binding.",
    },
    {
      num: "12",
      title: "Acceptance of Terms",
      body: "By submitting a prediction, participants agree to these terms and conditions in full.",
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

          <div className="flex items-center gap-3 mb-2">
            <span
              className="text-xs font-black px-2 py-1 rounded"
              style={{ background: "rgba(220,38,38,0.18)", color: "#ef4444", letterSpacing: "0.08em" }}
            >
              PRIZE
            </span>
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
              Official Terms & Conditions
            </span>
          </div>

          <h2
            className="text-white leading-none"
            style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(1.8rem,5vw,2.8rem)", letterSpacing: "0.04em" }}
          >
            $1,000 World Cup Group Stage
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
            Prediction Challenge
          </h2>
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
                <p
                  className="font-bold mb-1 text-sm uppercase tracking-wide"
                  style={{ color: "rgba(255,255,255,0.85)" }}
                >
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
