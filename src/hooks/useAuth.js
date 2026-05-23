import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export function useAuth() {
  const [user,    setUser]    = useState(null);
  const [profile, setProfile] = useState(null); // { username, avatar_url }
  const [loading, setLoading] = useState(true);

  async function fetchProfile(userId) {
    if (!userId) { setProfile(null); return; }
    const { data } = await supabase
      .from("profiles")
      .select("username, avatar_url")
      .eq("id", userId)
      .single();
    setProfile(data ?? null);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null;
      setUser(u);
      fetchProfile(u?.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      fetchProfile(u?.id);
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
