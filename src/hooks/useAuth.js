import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { setActiveStorageUser } from "../utils/storage";

export function useAuth() {
  const [user,    setUser]    = useState(null);
  const [profile, setProfile] = useState(null); // { username, avatar_url }
  const [loading, setLoading] = useState(true);

  async function fetchProfile(userId) {
    if (!userId) { setProfile(null); return; }
    const { data } = await supabase
      .from("profiles")
      .select("username, avatar_url, is_admin")
      .eq("id", userId)
      .single();
    setProfile(data ?? null);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null;
      setActiveStorageUser(u?.id ?? null); // before setUser, so re-renders read the right namespace
      setUser(u);
      fetchProfile(u?.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      setActiveStorageUser(u?.id ?? null);
      setUser(u);
      fetchProfile(u?.id);

      // When a user signs in, link their account to any terms acceptance they made
      // anonymously in this browser session (accepted before logging in).
      if (event === "SIGNED_IN" && u) {
        try {
          if (localStorage.getItem("wc2026-disclaimer-v1") === "accepted") {
            supabase.from("terms_acceptances").insert({
              user_id:    u.id,
              email:      u.email ?? null,
              version:    "v1",
              user_agent: navigator.userAgent,
            }).then(() => {});
          }
        } catch { /* localStorage unavailable */ }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
  }

  async function refreshProfile() {
    if (user) await fetchProfile(user.id);
  }

  return { user, profile, loading, signOut, refreshProfile };
}
