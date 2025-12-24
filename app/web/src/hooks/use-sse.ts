import { useEffect, useRef, useCallback } from "react";
import { api, type Worker, type Job } from "@/lib/api";
import { useWorkersStore } from "@/stores/workers";

export function useSSE() {
  const sourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setWorkers, updateWorker, setJobs, setConnected } = useWorkersStore();

  const connect = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close();
    }

    const source = api.stream();
    sourceRef.current = source;

    source.onopen = () => {
      setConnected(true);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    source.onerror = () => {
      setConnected(false);
      source.close();
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    };

    source.addEventListener("snapshot", (event) => {
      try {
        const data = JSON.parse(event.data);
        setWorkers(data.workers || []);
        setJobs(data.jobs || []);
      } catch (e) {
        console.error("Failed to parse snapshot:", e);
      }
    });

    source.addEventListener("worker:status", (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.worker?.profile?.id) {
          updateWorker(data.worker.profile.id, data.worker);
        }
      } catch (e) {
        console.error("Failed to parse worker status:", e);
      }
    });
  }, [setWorkers, updateWorker, setJobs, setConnected]);

  useEffect(() => {
    connect();
    return () => {
      sourceRef.current?.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [connect]);
}
