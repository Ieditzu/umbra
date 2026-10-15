import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { request } from "./api";

export interface LiveObservation {
  state: "watching" | "estimated" | "body_visible" | "camera_mismatch";
  position_norm: [number, number] | null;
  uncertainty_norm?: [number, number];
  body_box?: [number, number, number, number];
  image?: string;
  reason?: string;
}

interface Session { id: string; source: "browser" | "network" }

export function useLiveDetection(video: RefObject<HTMLVideoElement | null>, sceneId: string | undefined, onNotice: (message: string) => void) {
  const [session, setSession] = useState<Session | null>(null);
  const [starting, setStarting] = useState(false);
  const [observation, setObservation] = useState<LiveObservation | null>(null);
  const [networkImage, setNetworkImage] = useState<string | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const startController = useRef<AbortController | null>(null);

  function stop() {
    startController.current?.abort();
    startController.current = null;
    const current = sessionRef.current;
    sessionRef.current = null;
    setSession(null);
    setObservation(null);
    setNetworkImage(null);
    setStarting(false);
    if (current) void request(`/live/${current.id}`, { method: "DELETE" }).catch(() => {});
  }

  async function start(cameraUrl?: string) {
    if (!sceneId || sessionRef.current || starting) return;
    const controller = new AbortController();
    startController.current = controller;
    setStarting(true);
    try {
      const next = await request<Session>(`/scenes/${sceneId}/live-sessions`, {
        method: "POST", body: JSON.stringify({ camera_url: cameraUrl || null }), signal: controller.signal
      });
      if (controller.signal.aborted) {
        void request(`/live/${next.id}`, { method: "DELETE" }).catch(() => {});
        return;
      }
      sessionRef.current = next;
      setSession(next);
    } catch (error) {
      if (!controller.signal.aborted) onNotice(error instanceof Error ? error.message : "Could not start detection");
    } finally {
      if (startController.current === controller) setStarting(false);
    }
  }

  useEffect(() => {
    return () => stop();
  }, [sceneId]);

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    const canvas = document.createElement("canvas");
    let timer: number;
    let staleTimer: number;
    const clearHiddenOverlay = () => {
      if (document.visibilityState !== "visible") setObservation(null);
    };
    document.addEventListener("visibilitychange", clearHiddenOverlay);
    const poll = async () => {
      if (controller.signal.aborted) return;
      const timeout = window.setTimeout(() => controller.abort(), 5000);
      try {
        let next: LiveObservation;
        const sentAt = Date.now();
        if (session.source === "network") {
          next = await request<LiveObservation>(`/live/${session.id}/frame`, { signal: controller.signal });
        } else {
          const element = video.current;
          if (!element || element.readyState < 2 || !element.videoWidth) return;
          canvas.width = 480;
          canvas.height = Math.round(element.videoHeight * 480 / element.videoWidth);
          canvas.getContext("2d")?.drawImage(element, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
          if (!blob || controller.signal.aborted) return;
          const body = new FormData();
          body.append("file", blob, "frame.jpg");
          next = await request<LiveObservation>(`/live/${session.id}/frame`, { method: "POST", body, signal: controller.signal });
        }
        if (controller.signal.aborted) return;
        window.clearTimeout(staleTimer);
        if (next.image) setNetworkImage(next.image);
        // Slow, failed or missing evidence cannot leave a stale person dot.
        setObservation(Date.now() - sentAt < 1000 ? next : null);
        staleTimer = window.setTimeout(() => { setObservation(null); if (session.source === "network") setNetworkImage(null); }, 1000);
        if (next.state === "camera_mismatch") {
          onNotice(next.reason || "The camera no longer matches its calibration");
          stop();
        }
      } catch (error) {
        if (!controller.signal.aborted) onNotice(error instanceof Error ? error.message : "Live camera disconnected");
        if (sessionRef.current?.id === session.id) stop();
      } finally {
        window.clearTimeout(timeout);
        if (controller.signal.aborted && sessionRef.current?.id === session.id) {
          onNotice("Live camera timed out. Start detection again.");
          stop();
        }
        if (!controller.signal.aborted && sessionRef.current?.id === session.id) timer = window.setTimeout(() => void poll(), 200);
      }
    };
    void poll();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
      window.clearTimeout(staleTimer);
      document.removeEventListener("visibilitychange", clearHiddenOverlay);
    };
  }, [session]);

  return { session, starting, observation, networkImage, start, stop };
}
