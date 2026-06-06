import { useState, useEffect } from "react";
import GroupStage    from "./pages/GroupStage";
import Bracket       from "./pages/Bracket";
import MyBracket     from "./pages/MyBracket";
import MyBrackets    from "./pages/MyBrackets";
import { getBracketById } from "./utils/storage";
import Profile       from "./pages/Profile";
import Dashboard     from "./pages/Dashboard";
import Rules         from "./pages/Rules";
import Admin         from "./pages/Admin";
import Leaderboard   from "./pages/Leaderboard";
import Leagues       from "./pages/Leagues";
import InviteRedirect from "./pages/InviteRedirect";
import AuthModal     from "./components/AuthModal";
import DisclaimerModal, { hasAcceptedDisclaimer } from "./components/DisclaimerModal";
import SignInGate from "./components/SignInGate";
import TeamModal     from "./pages/TeamModal";
import Teams         from "./pages/Teams";
import { useAuth }   from "./hooks/useAuth";
import banner        from "./assets/worldcupbanner.webp";
import trophy        from "./assets/worldcuppng.webp";
import wclogo        from "./assets/worldcuplogo.webp";
import "./index.css";

const HOST_NATIONS = [
  { name: "USA",    flag: "🇺🇸" },
  { name: "Canada", flag: "🇨🇦" },
  { name: "Mexico", flag: "🇲🇽" },
];

const SIDEBAR_W  = 220; // expanded px
const SIDEBAR_WC = 64;  // collapsed px

// ── Icons ─────────────────────────────────────────────────────────────────────

const IconGrid    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>;
const IconBracket = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
const IconEdit    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>;
const IconTrophy  = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5h4"/><path d="M18 9h2a2 2 0 0 0 2-2V5h-4"/><path d="M8 21h8"/><path d="M12 17v4"/><path d="M6 5v4a6 6 0 0 0 12 0V5H6z"/></svg>;
const IconMenu    = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6"  x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>;
const IconChevronLeft  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>;
const IconChevronRight = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>;
const IconUser         = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const IconBarChart     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
const IconShield       = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
const IconLeaderboard  = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="14" width="5" height="7"/><rect x="9" y="9" width="5" height="12"/><rect x="16" y="4" width="5" height="17"/></svg>;
const IconLeagues      = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;

// ── Countdown ─────────────────────────────────────────────────────────────────

const WC_START = new Date("2026-06-11T19:00:00-05:00"); // kick-off: Mexico City

function useCountdown() {
  const [timeLeft, setTimeLeft] = useState(() => Math.max(0, WC_START - Date.now()));
  useEffect(() => {
    const id = setInterval(() => setTimeLeft(Math.max(0, WC_START - Date.now())), 1000);
    return () => clearInterval(id);
  }, []);
  const total   = Math.floor(timeLeft / 1000);
  const days    = Math.floor(total / 86400);
  const hours   = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return { days, hours, minutes, seconds, started: timeLeft === 0 };
}

function CountdownBanner() {
  const { days, hours, minutes, seconds, started } = useCountdown();
  const pad = n => String(n).padStart(2, "0");

  return (
    <div
      className="w-full flex items-center justify-center gap-6 px-4 py-2 shrink-0"
      style={{ background: "linear-gradient(90deg, #1a3a8f 0%, #1e40af 50%, #1a3a8f 100%)", borderBottom: "1px solid rgba(255,255,255,0.1)" }}
    >
      {/* Left: FIFA branding */}
      <div className="hidden sm:flex items-center gap-3">
        <img src={wclogo} alt="FIFA World Cup 2026" className="w-8 h-8 object-contain" />
        <div>
          <p className="font-black text-white leading-none" style={{ fontSize: "0.75rem", letterSpacing: "0.04em" }}>
            FIFA World Cup 2026™
          </p>
          <p style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.55)", fontWeight: 600, letterSpacing: "0.06em" }}>
            11 June – 19 July 2026
          </p>
        </div>
      </div>

      <div className="hidden sm:block w-px h-6" style={{ background: "rgba(255,255,255,0.15)" }} />

      {/* Countdown units */}
      {started ? (
        <div className="flex items-center gap-2">
            <img src={wclogo} alt="" className="w-6 h-6 object-contain" />
            <p className="font-black text-white tracking-widest text-sm">🔴 LIVE NOW</p>
          </div>
      ) : (
        <div className="flex items-center gap-4">
          {[
            { value: days,    label: "days"  },
            { value: hours,   label: "hours" },
            { value: minutes, label: "mins"  },
            { value: seconds, label: "secs"  },
          ].map(({ value, label }, i) => (
            <div key={label} className="flex items-start gap-4">
              {i > 0 && <span className="font-black text-white opacity-40 mt-0.5" style={{ fontSize: "1.1rem", lineHeight: 1 }}>:</span>}
              <div className="text-center">
                <p className="font-black text-white leading-none tabular-nums"
                  style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(1.2rem, 3vw, 1.6rem)", letterSpacing: "0.04em" }}>
                  {label === "days" ? days : pad(value)}
                </p>
                <p style={{ fontSize: "0.55rem", color: "rgba(255,255,255,0.5)", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 2 }}>
                  {label}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  // Detect /invite/<token> on load
  const inviteToken = (() => {
    const m = window.location.pathname.match(/^\/invite\/([a-z0-9]{8})$/i);
    return m ? m[1] : null;
  })();

  const [activeTab,   setActiveTab]   = useState(inviteToken ? "invite" : "groups"); // "groups"|"bracket"|"mine"|"profile"|"dashboard"|"leaderboard"|"leagues"|"invite"
  const [leagueContext, setLeagueContext] = useState(null); // { id, name } when navigating to leaderboard from a league
  const [showRules,   setShowRules]   = useState(false);
  const [showAdmin,   setShowAdmin]   = useState(false);
  const [showAuth,    setShowAuth]    = useState(false);
  const [authMode,    setAuthMode]    = useState("login");
  const [sidebarOpen,     setSidebarOpen]     = useState(false);
  const [collapsed,       setCollapsed]       = useState(false);
  const [activeBracketId, setActiveBracketId] = useState(null);
  const [disclaimerDone, setDisclaimerDone]   = useState(() => hasAcceptedDisclaimer());

  const { user, profile, loading: authLoading, signOut } = useAuth();
  const displayName = user
    ? (user.user_metadata?.display_name || user.email?.split("@")[0] || "You")
    : null;

  const sidebarW = collapsed ? SIDEBAR_WC : SIDEBAR_W;

  function navigate(tab, ctx = null) {
    setActiveTab(tab);
    setSidebarOpen(false);
    if (tab !== "mine") setActiveBracketId(null);
    if (tab === "leaderboard") setLeagueContext(ctx); // ctx = { id, name } or null
  }

  // ── Nav item ─────────────────────────────────────────────────────────────────

  function SideNavItem({ label, icon, active, onClick, accent = "#c8f000", muted = false, locked = false }) {
    const rgb = accent === "#ef4444" ? "239,68,68" : accent === "#f59e0b" ? "245,158,11" : "200,240,0";
    return (
      <button
        onClick={onClick}
        title={collapsed ? (locked ? `${label} — sign in required` : label) : undefined}
        className="w-full flex items-center rounded-xl transition-all duration-150"
        style={{
          gap:         collapsed ? 0 : 12,
          padding:     collapsed ? "10px 0" : "10px 12px",
          justifyContent: collapsed ? "center" : "flex-start",
          background:  active ? `rgba(${rgb},0.1)` : "transparent",
          color:       active ? accent : muted ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.5)",
          fontSize:    "0.8rem",
          fontWeight:  600,
          borderLeft:  collapsed ? "none" : `2px solid ${active ? accent : "transparent"}`,
          outline:     active && collapsed ? `1px solid rgba(${rgb},0.35)` : "none",
        }}
        onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.8)"; } }}
        onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = muted ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.5)"; } }}
      >
        <span style={{ color: active ? accent : "rgba(255,255,255,0.3)", flexShrink: 0 }}>
          {icon}
        </span>
        {!collapsed && (
          <span className="flex-1 flex items-center justify-between min-w-0">
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
            {locked && (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "rgba(255,255,255,0.2)", flexShrink: 0, marginLeft: 4 }}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            )}
          </span>
        )}
      </button>
    );
  }

  // ── Sidebar ───────────────────────────────────────────────────────────────────

  const sidebar = (
    <aside
      className={`fixed top-0 left-0 h-full z-50 flex flex-col transition-all duration-300 ease-in-out ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      style={{ width: sidebarW, background: "#0d0120", borderRight: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}
    >
      {/* ── Logo / header ── */}
      <div
        className="flex items-center shrink-0 px-4"
        style={{ height: 60, borderBottom: "1px solid rgba(255,255,255,0.07)", gap: collapsed ? 0 : 10 }}
      >
        {/* Wordmark — hidden when collapsed */}
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.1rem", color: "white", letterSpacing: "0.06em", lineHeight: 1 }}>
              FIFA WC 2026
            </p>
            <p style={{ fontSize: "0.55rem", color: "rgba(255,255,255,0.28)", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 3 }}>
              Match Predictor
            </p>
          </div>
        )}

        {/* Collapse toggle (desktop) */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="hidden md:flex items-center justify-center rounded-lg transition-all shrink-0"
          style={{
            width: 28, height: 28,
            background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.35)",
            border: "1px solid rgba(255,255,255,0.08)",
            marginLeft: collapsed ? "auto" : 0,
            marginRight: collapsed ? "auto" : 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "white"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.35)"; }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <IconChevronRight /> : <IconChevronLeft />}
        </button>

        {/* Mobile close */}
        {!collapsed && (
          <button
            className="md:hidden flex items-center justify-center w-6 h-6 rounded-full shrink-0"
            style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.4)", fontSize: "0.7rem" }}
            onClick={() => setSidebarOpen(false)}
          >✕</button>
        )}
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 overflow-y-auto flex flex-col" style={{ padding: collapsed ? "12px 8px" : "12px" }}>

        {/* Section label — hidden when collapsed */}
        {!collapsed && (
          <p className="px-3 pt-3 pb-1.5 shrink-0" style={{ fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(200,240,0,0.38)" }}>
            AI Predictions
          </p>
        )}
        {collapsed && <div style={{ height: 16 }} />}

        <SideNavItem
          label="Group Stage"
          icon={<IconGrid />}
          active={activeTab === "groups"}
          onClick={() => navigate("groups")}
          accent="#c8f000"
          locked={!user}
        />
        <SideNavItem
          label="Simulated Bracket"
          icon={<IconBracket />}
          active={activeTab === "bracket"}
          onClick={() => navigate("bracket")}
          accent="#c8f000"
          locked={!user}
        />

        <div className="shrink-0" style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "12px 0" }} />

        <SideNavItem label="My Brackets"  icon={<IconEdit />}        active={activeTab === "mine"}        onClick={() => navigate("mine")}        accent="#ef4444" />
        <SideNavItem label="Teams"        icon={<IconShield />}      active={activeTab === "teams"}       onClick={() => navigate("teams")}       accent="#c8f000" />
        <SideNavItem label="Leaderboard"  icon={<IconLeaderboard />} active={activeTab === "leaderboard"} onClick={() => navigate("leaderboard")} accent="#f59e0b" />
        <SideNavItem label="Leagues"      icon={<IconLeagues />}     active={activeTab === "leagues"}     onClick={() => navigate("leagues")}     accent="#c8f000" />

        <div className="shrink-0" style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "12px 0" }} />

        <SideNavItem label="Rules" icon={<IconTrophy />} active={false} onClick={() => { setShowRules(true); setSidebarOpen(false); }} accent="#f59e0b" muted />

        {/* Account section — only when signed in */}
        {user && (
          <>
            <div className="shrink-0" style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "12px 0" }} />

            {!collapsed && (
              <p className="px-3 pb-1.5 shrink-0" style={{ fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(200,240,0,0.38)" }}>
                Account
              </p>
            )}

            <SideNavItem label="Dashboard" icon={<IconBarChart />} active={activeTab === "dashboard"} onClick={() => navigate("dashboard")} accent="#c8f000" />
            <SideNavItem label="Profile"   icon={<IconUser />}     active={activeTab === "profile"}   onClick={() => navigate("profile")}   accent="#c8f000" />
            {profile?.is_admin && (
              <SideNavItem label="Admin" icon={<IconShield />} active={false} onClick={() => { setShowAdmin(true); setSidebarOpen(false); }} accent="#ef4444" />
            )}
          </>
        )}
      </nav>

      {/* ── Auth ── */}
      <div
        className="shrink-0"
        style={{ borderTop: "1px solid rgba(255,255,255,0.07)", padding: collapsed ? "12px 8px" : "16px" }}
      >
        {!authLoading && (user ? (
          collapsed ? (
            /* Collapsed: just avatar → clicks to profile */
            <div className="flex justify-center">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center font-black text-sm cursor-pointer"
                style={{ background: "linear-gradient(135deg,#c8f000,#84cc16)", color: "#1a0533" }}
                title={`${displayName} — View Profile`}
                onClick={() => navigate("profile")}
              >
                {displayName[0].toUpperCase()}
              </div>
            </div>
          ) : (
            /* Expanded: avatar + name + profile/sign-out links */
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center font-black text-sm shrink-0 cursor-pointer"
                style={{ background: "linear-gradient(135deg,#c8f000,#84cc16)", color: "#1a0533" }}
                onClick={() => navigate("profile")}
                title="View Profile"
              >
                {displayName[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => navigate("profile")}
                  className="text-xs font-bold text-white truncate block w-full text-left transition-colors"
                  onMouseEnter={e => e.currentTarget.style.color = "#c8f000"}
                  onMouseLeave={e => e.currentTarget.style.color = "white"}
                >
                  {displayName}
                </button>
                <button
                  onClick={signOut}
                  className="text-xs transition-colors"
                  style={{ color: "rgba(255,255,255,0.3)" }}
                  onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                  onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.3)"}
                >
                  Sign out
                </button>
              </div>
            </div>
          )
        ) : (
          collapsed ? (
            /* Collapsed: small icon button */
            <div className="flex justify-center">
              <button
                onClick={() => { setAuthMode("login"); setShowAuth(true); }}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                style={{ background: "linear-gradient(135deg,#c8f000,#84cc16)", color: "#1a0533" }}
                title="Sign In / Sign Up"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
                </svg>
              </button>
            </div>
          ) : (
            /* Expanded: full button */
            <button
              onClick={() => { setAuthMode("login"); setShowAuth(true); }}
              className="w-full py-2.5 rounded-xl font-black text-sm transition-all duration-150 active:scale-95"
              style={{ background: "linear-gradient(135deg,#c8f000,#84cc16)", color: "#1a0533" }}
              onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
              onMouseLeave={e => e.currentTarget.style.opacity = "1"}
            >
              Sign In / Sign Up
            </button>
          )
        ))}
      </div>
    </aside>
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#1a0533" }}>

      <CountdownBanner />

      <div className="flex flex-1 min-h-0">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(2px)" }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {sidebar}

      {/* ── Main content (margin-left mirrors sidebar width on desktop) ── */}
      <div
        id="app-main"
        className="flex flex-col min-h-screen flex-1 min-w-0"
      >
        {/* Mobile top bar */}
        <div
          className="md:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3 shrink-0"
          style={{ background: "rgba(13,1,32,0.97)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}
        >
          <button onClick={() => setSidebarOpen(true)} style={{ color: "rgba(255,255,255,0.6)" }}>
            <IconMenu />
          </button>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.1rem", color: "white", letterSpacing: "0.08em" }}>
            FIFA WC 2026
          </span>
          <div className="ml-auto">
            {!authLoading && (user ? (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center font-black text-xs cursor-pointer"
                style={{ background: "linear-gradient(135deg,#c8f000,#84cc16)", color: "#1a0533" }}
                onClick={() => setSidebarOpen(true)}
              >
                {displayName[0].toUpperCase()}
              </div>
            ) : (
              <button
                onClick={() => { setAuthMode("login"); setShowAuth(true); }}
                className="text-xs font-black px-3 py-1.5 rounded-full"
                style={{ background: "linear-gradient(135deg,#c8f000,#84cc16)", color: "#1a0533" }}
              >
                Sign In
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex flex-col flex-1 min-w-0">

            {/* Hero — only on AI Predictions tabs for signed-in users */}
            {(activeTab === "groups" || activeTab === "bracket") && user && (
              <header className="relative overflow-hidden shrink-0" style={{ minHeight: 320 }}>
                <img src={banner} alt="FIFA World Cup 2026" className="absolute inset-0 w-full h-full object-cover object-center" />
                <div className="absolute inset-0" style={{ background: "linear-gradient(90deg,rgba(15,4,40,0.9) 0%,rgba(15,4,40,0.65) 55%,rgba(15,4,40,0.15) 100%)" }} />

                <div className="relative max-w-3xl mx-auto px-6 py-10 flex items-center gap-8 h-full" style={{ minHeight: 320 }}>
                  <div className="shrink-0 hidden sm:block">
                    <img src={trophy} alt="Trophy" className="w-28 h-28 object-contain" style={{ mixBlendMode: "luminosity", filter: "drop-shadow(0 0 24px rgba(200,240,0,0.25))" }} />
                  </div>

                  <div className="flex flex-col gap-3 flex-1">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] mb-1" style={{ color: "#c8f000" }}>Match Predictor</p>
                      <h1 className="text-white leading-none" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(2.4rem, 6vw, 4.5rem)", letterSpacing: "0.04em" }}>FIFA World Cup</h1>
                      <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(2.4rem, 6vw, 4.5rem)", letterSpacing: "0.04em", lineHeight: 1, background: "linear-gradient(90deg,#c8f000,#a3e635)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>2026</h1>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>Hosted by</span>
                      {HOST_NATIONS.map(n => (
                        <div key={n.name} className="flex items-center gap-1.5 rounded-full px-3 py-1" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}>
                          <span className="text-sm leading-none">{n.flag}</span>
                          <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.7)" }}>{n.name}</span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-1">
                      <button
                        onClick={() => navigate("leagues")}
                        className="group inline-flex items-center gap-3 rounded-2xl px-6 py-4 font-black transition-all duration-200 active:scale-95"
                        style={{ background: "linear-gradient(135deg,#dc2626,#b91c1c)", boxShadow: "0 0 32px rgba(220,38,38,0.55),0 4px 16px rgba(0,0,0,0.4)", border: "1px solid rgba(255,100,100,0.3)", animation: "ctaPulse 2.5s ease-in-out infinite" }}
                        onMouseEnter={e => { e.currentTarget.style.background = "linear-gradient(135deg,#ef4444,#dc2626)"; e.currentTarget.style.boxShadow = "0 0 48px rgba(239,68,68,0.7)"; e.currentTarget.style.animation = "none"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "linear-gradient(135deg,#dc2626,#b91c1c)"; e.currentTarget.style.boxShadow = "0 0 32px rgba(220,38,38,0.55),0 4px 16px rgba(0,0,0,0.4)"; e.currentTarget.style.animation = "ctaPulse 2.5s ease-in-out infinite"; }}
                      >
                        <span style={{ fontSize: "1.6rem", lineHeight: 1 }}>🏆</span>
                        <div className="text-left">
                          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.5rem", letterSpacing: "0.06em", color: "white", lineHeight: 1 }}>JOIN A LEAGUE</div>
                          <div className="text-xs font-semibold mt-0.5" style={{ color: "rgba(255,255,255,0.75)", letterSpacing: "0.04em" }}>Compete with friends & climb the rankings →</div>
                        </div>
                        <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" style={{ color: "rgba(255,255,255,0.7)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                        </svg>
                      </button>
                      <p className="text-xs mt-2" style={{ color: "rgba(255,255,255,0.25)" }}>Make your picks · Submit your bracket · Compete with friends</p>
                      <button onClick={() => setShowRules(true)} className="text-xs mt-1 underline underline-offset-2 transition-colors" style={{ color: "rgba(200,240,0,0.45)" }} onMouseEnter={e => e.currentTarget.style.color = "#c8f000"} onMouseLeave={e => e.currentTarget.style.color = "rgba(200,240,0,0.45)"}>
                        View Rules & Prize Details →
                      </button>
                    </div>
                  </div>
                </div>

                <div className="absolute bottom-0 left-0 right-0 h-10" style={{ background: "linear-gradient(to bottom, transparent, #1a0533)" }} />
              </header>
            )}

            {/* Page content */}
            <main className="flex-1" style={{ background: "#1a0533" }}>
              {activeTab === "groups"  && (user
                ? <GroupStage />
                : <SignInGate
                    tab="groups"
                    onSignIn={() => { setAuthMode("login");  setShowAuth(true); }}
                    onSignUp={() => { setAuthMode("signup"); setShowAuth(true); }}
                  />
              )}
              {activeTab === "bracket" && (user
                ? <Bracket />
                : <SignInGate
                    tab="bracket"
                    onSignIn={() => { setAuthMode("login");  setShowAuth(true); }}
                    onSignUp={() => { setAuthMode("signup"); setShowAuth(true); }}
                  />
              )}
              {activeTab === "mine"      && (
                activeBracketId
                  ? <MyBracket
                      bracketData={getBracketById(activeBracketId)}
                      onBack={() => setActiveBracketId(null)}
                    />
                  : <MyBrackets onOpen={(id) => setActiveBracketId(id)} />
              )}
              {activeTab === "teams"       && <Teams />}
              {activeTab === "leaderboard" && <Leaderboard initialLeague={leagueContext} />}
              {activeTab === "leagues"     && <Leagues onNavigate={navigate} />}
              {activeTab === "invite"      && <InviteRedirect token={inviteToken} onNavigate={navigate} onSignUp={() => { setAuthMode("signup"); setShowAuth(true); }} />}
              {activeTab === "dashboard"   && <Dashboard onNavigate={navigate} />}
              {activeTab === "profile"     && <Profile   onNavigate={navigate} />}
            </main>

            {/* Footer */}
            <footer className="text-center py-5 text-xs shrink-0" style={{ color: "rgba(255,255,255,0.2)", borderTop: "1px solid rgba(255,255,255,0.06)", background: "#120326" }}>
              FIFA World Cup 2026 Predictor · ELO ratings + recent form · June 11 – July 19, 2026
              <span className="mx-2" style={{ color: "rgba(255,255,255,0.1)" }}>·</span>
              <button onClick={() => setShowRules(true)} className="underline underline-offset-2 transition-colors" style={{ color: "rgba(200,240,0,0.35)" }} onMouseEnter={e => e.currentTarget.style.color = "#c8f000"} onMouseLeave={e => e.currentTarget.style.color = "rgba(200,240,0,0.35)"}>Rules</button>
              <span className="mx-2" style={{ color: "rgba(255,255,255,0.1)" }}>·</span>
              <button onClick={() => setDisclaimerDone(false)} className="underline underline-offset-2 transition-colors" style={{ color: "rgba(255,255,255,0.2)" }} onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,0.5)"} onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.2)"}>Terms & Disclaimer</button>
              <span className="mx-2" style={{ color: "rgba(255,255,255,0.1)" }}>·</span>
              <button onClick={() => setShowAdmin(true)} className="transition-colors" style={{ color: "rgba(255,255,255,0.1)" }} onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,0.4)"} onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.1)"}>admin</button>
            </footer>
          </div>
        </div>
      </div>

      {/* Responsive offset + CTA pulse */}
      <style>{`
        @media (min-width: 768px) {
          #app-main { margin-left: ${sidebarW}px; transition: margin-left 0.3s ease-in-out; }
        }
        @keyframes ctaPulse {
          0%,100% { box-shadow: 0 0 32px rgba(220,38,38,0.55), 0 4px 16px rgba(0,0,0,0.4); }
          50%      { box-shadow: 0 0 52px rgba(239,68,68,0.8),  0 4px 20px rgba(0,0,0,0.4); }
        }
      `}</style>

      {/* Modals */}
      {showRules && <Rules  onClose={() => setShowRules(false)} />}
      {showAdmin && <Admin  onClose={() => setShowAdmin(false)} />}
      {showAuth  && <AuthModal initialMode={authMode} onClose={() => setShowAuth(false)} onAuth={() => setShowAuth(false)} />}
      <TeamModal />

      {/* Disclaimer — blocks site until user accepts */}
      {!disclaimerDone && <DisclaimerModal onAccept={() => setDisclaimerDone(true)} />}
      </div>{/* end flex row */}
    </div>
  );
}
