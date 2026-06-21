import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { createClientUuid, getAnonymousId } from "../lib/clientIdentity";

const SESSION_KEY = "wc2026-activity-session-v1";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const HEARTBEAT_MS = 60 * 1000;
const RECENT_ACTIVITY_MS = 2 * 60 * 1000;

let activeRecorder = null;

export function trackActivityEvent(eventName, metadata = {}) {
  return activeRecorder?.(eventName, metadata) ?? Promise.resolve(false);
}

function readSession(identityKey, anonymousId) {
  try {
    const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if (
      stored?.identityKey === identityKey &&
      stored?.anonymousId === anonymousId &&
      Date.now() - Number(stored.lastTouchedAt) < SESSION_TIMEOUT_MS
    ) {
      return { ...stored, isNew: false };
    }
  } catch { /* Start a fresh session. */ }

  return {
    id: createClientUuid(),
    identityKey,
    anonymousId,
    startedAt: new Date().toISOString(),
    lastTouchedAt: Date.now(),
    activeSeconds: 0,
    pageViews: 0,
    isNew: true,
  };
}

function storeSession(session) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, isNew: undefined }));
  } catch { /* Tracking still works without session persistence. */ }
}

/**
 * First-party usage tracking. Active time advances only while the tab is
 * visible and the visitor has interacted in the last two minutes.
 */
export function useActivityTracking({ user, page, enabled = true }) {
  const sessionRef = useRef(null);
  const readyRef = useRef(Promise.resolve(false));
  const pageRef = useRef(page);
  const lastInteractionRef = useRef(0);
  const lastTickRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      activeRecorder = null;
      return undefined;
    }

    const anonymousId = getAnonymousId();
    const identityKey = user?.id ? `user:${user.id}` : `anon:${anonymousId}`;
    const session = readSession(identityKey, anonymousId);
    sessionRef.current = session;
    lastInteractionRef.current = Date.now();
    lastTickRef.current = Date.now();
    storeSession(session);

    const sessionRow = {
      id:             session.id,
      user_id:        user?.id ?? null,
      anonymous_id:   anonymousId,
      started_at:     session.startedAt,
      last_seen_at:   new Date().toISOString(),
      active_seconds: session.activeSeconds,
      page_views:     session.pageViews,
      entry_page:     pageRef.current,
      current_page:   pageRef.current,
      user_agent:     navigator.userAgent,
    };

    readyRef.current = supabase.from("app_sessions").insert(sessionRow).then(async ({ error }) => {
      if (error && error.code !== "23505") return false;
      if (error?.code === "23505") {
        const { error: updateError } = await supabase.from("app_sessions")
          .update({ last_seen_at: new Date().toISOString(), current_page: pageRef.current })
          .eq("id", session.id);
        if (updateError) return false;
      }
      return true;
    });

    async function recordEvent(eventName, metadata = {}) {
      const ready = await readyRef.current;
      const current = sessionRef.current;
      if (!ready || !current) return false;

      const { error } = await supabase.from("app_activity_events").insert({
        session_id:   current.id,
        user_id:      user?.id ?? null,
        anonymous_id: current.anonymousId,
        event_name:   eventName,
        page:         pageRef.current,
        metadata,
      });
      return !error;
    }

    activeRecorder = recordEvent;
    if (session.isNew) recordEvent("session_start");

    return () => {
      if (activeRecorder === recordEvent) activeRecorder = null;
    };
  }, [enabled, user?.id]);

  useEffect(() => {
    if (!enabled || !sessionRef.current) return;
    pageRef.current = page;
    lastInteractionRef.current = Date.now();

    const session = sessionRef.current;
    session.pageViews += 1;
    session.lastTouchedAt = Date.now();
    storeSession(session);

    readyRef.current.then((ready) => {
      if (!ready) return;
      supabase.from("app_sessions")
        .update({
          page_views: session.pageViews,
          current_page: page,
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", session.id)
        .then(() => {});
      activeRecorder?.("page_view", { page });
    });
  }, [enabled, page, user?.id]);

  useEffect(() => {
    if (!enabled) return undefined;

    const noteInteraction = () => { lastInteractionRef.current = Date.now(); };

    async function heartbeat(countHiddenTransition = false) {
      const session = sessionRef.current;
      const now = Date.now();
      const wasRecentlyActive = now - lastInteractionRef.current <= RECENT_ACTIVITY_MS;
      const canCount = (document.visibilityState === "visible" || countHiddenTransition) && wasRecentlyActive;
      const elapsed = Math.max(0, Math.min(60, Math.round((now - lastTickRef.current) / 1000)));
      lastTickRef.current = now;
      if (!session || !canCount || elapsed === 0) return;

      session.activeSeconds += elapsed;
      session.lastTouchedAt = now;
      storeSession(session);

      const ready = await readyRef.current;
      if (!ready) return;
      await Promise.all([
        supabase.from("app_sessions")
          .update({
            active_seconds: session.activeSeconds,
            last_seen_at: new Date().toISOString(),
            current_page: pageRef.current,
          })
          .eq("id", session.id),
        activeRecorder?.("heartbeat", { active_seconds: elapsed }),
      ]);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") heartbeat(true);
      else {
        lastTickRef.current = Date.now();
        noteInteraction();
      }
    }

    const handlePageHide = () => { heartbeat(true); };

    const interval = window.setInterval(() => heartbeat(false), HEARTBEAT_MS);
    const activityEvents = ["pointerdown", "keydown", "touchstart", "scroll"];
    activityEvents.forEach(name => window.addEventListener(name, noteInteraction, { passive: true }));
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.clearInterval(interval);
      activityEvents.forEach(name => window.removeEventListener(name, noteInteraction));
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [enabled, user?.id]);
}
