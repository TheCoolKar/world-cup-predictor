/**
 * useLiveFeed — live match state + event timelines via Supabase Realtime.
 *
 * Loads current live_matches / match_events once, then subscribes to
 * postgres_changes so goals, cards, and subs appear without polling.
 * Rows are written by scripts/fetchLiveFeed.mjs (FotMob poller).
 *
 * Returns:
 *   liveMatches — { [matchId]: { status, minute, home_score, away_score, … } }
 *   liveEvents  — { [matchId]: [event, …] } sorted by seq
 */

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function useLiveFeed() {
  const [liveMatches, setLiveMatches] = useState({});
  const [liveEvents,  setLiveEvents]  = useState({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [lm, ev] = await Promise.all([
        supabase.from("live_matches").select("*"),
        supabase.from("match_events").select("*").order("seq", { ascending: true }),
      ]);
      if (cancelled) return;
      setLiveMatches(Object.fromEntries((lm.data ?? []).map(r => [r.match_id, r])));
      const grouped = {};
      for (const e of ev.data ?? []) (grouped[e.match_id] ??= []).push(e);
      setLiveEvents(grouped);
    }
    load();

    const channel = supabase
      .channel("live-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_matches" }, ({ new: row }) => {
        if (row?.match_id) setLiveMatches(prev => ({ ...prev, [row.match_id]: row }));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "match_events" }, ({ new: row }) => {
        if (!row?.match_id) return;
        setLiveEvents(prev => {
          const list = (prev[row.match_id] ?? []).filter(e => e.seq !== row.seq);
          list.push(row);
          list.sort((a, b) => a.seq - b.seq);
          return { ...prev, [row.match_id]: list };
        });
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return { liveMatches, liveEvents };
}
