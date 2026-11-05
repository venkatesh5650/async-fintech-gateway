"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ActionTriggers from "@/components/ActionTriggers";
import BatchCommandCenter from "@/components/BatchCommandCenter";
import { useBikeTransition } from "@/context/BikeTransitionContext";
import { BatchAssetStatus, BatchJobAcceptedResponse } from "@/types/api";

export default function RunsPage() {
  const { launchBikeTransition } = useBikeTransition();
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batchAssets, setBatchAssets] = useState<BatchAssetStatus[]>([]);
  const [cooldown, setCooldown] = useState(0);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assetsRef = useRef<BatchAssetStatus[]>([]);
  const batchIdRef = useRef<string | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    assetsRef.current = batchAssets;
  }, [batchAssets]);
  useEffect(() => {
    batchIdRef.current = batchId;
  }, [batchId]);

  useEffect(() => {
    const storedId = localStorage.getItem("batch_id");
    const storedAssets = localStorage.getItem("batch_assets");
    if (storedId && storedAssets) {
      setBatchId(storedId);
      setBatchAssets(JSON.parse(storedAssets));
    }
    const until = localStorage.getItem("cooldown_until");
    if (until) {
      const remaining = Math.ceil((parseInt(until, 10) - Date.now()) / 1000);
      if (remaining > 0) setCooldown(remaining);
    }
  }, []);

  useEffect(() => {
    if (batchId) {
      localStorage.setItem("batch_id", batchId);
      localStorage.setItem("batch_assets", JSON.stringify(batchAssets));
    }
  }, [batchId, batchAssets]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const publish = useCallback((nextId: string | null, nextAssets: BatchAssetStatus[]) => {
    channelRef.current?.postMessage({
      type: "BATCH_UPDATE",
      payload: nextId ? { batchId: nextId, batchAssets: nextAssets } : null,
    });
  }, []);

  useEffect(() => {
    const channel = new BroadcastChannel("fintech_gateway_sync");
    channelRef.current = channel;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "BATCH_UPDATE") return;
      const payload = event.data.payload;
      if (!payload) {
        setBatchId(null);
        setBatchAssets([]);
        return;
      }
      setBatchId(payload.batchId);
      setBatchAssets(payload.batchAssets);
    };
    channel.addEventListener("message", onMessage);
    return () => {
      channel.removeEventListener("message", onMessage);
      channel.close();
      channelRef.current = null;
    };
  }, []);

  const pendingKey = batchAssets
    .filter((asset) => asset.status === "processing" || asset.status === "queued")
    .map((asset) => asset.job_id)
    .join(",");

  useEffect(() => {
    if (!pendingKey) return;

    const refresh = async () => {
      const current = assetsRef.current.filter(
        (asset) => asset.status === "processing" || asset.status === "queued"
      );
      if (current.length === 0) return;
      const updates = await Promise.all(
        current.map(async (asset) => {
          try {
            const res = await fetch(`/api/jobs/${asset.job_id}`);
            if (!res.ok) return null;
            const data = await res.json();
            return { job_id: asset.job_id, status: data.status, result: data.result, error: data.error };
          } catch {
            return null;
          }
        })
      );
      setBatchAssets((prev) => {
        const next = prev.map((asset) => {
          const update = updates.find((item) => item && item.job_id === asset.job_id);
          return update ? { ...asset, ...update } : asset;
        });
        if (batchIdRef.current) publish(batchIdRef.current, next);
        return next;
      });
    };

    refresh();
    const interval = setInterval(refresh, 4000);
    return () => clearInterval(interval);
  }, [pendingKey, publish]);

  const handleBatchDispatch = async (tickers: string[]) => {
    if (cooldown > 0 || isBatchProcessing) return;
    setCooldown(60);
    localStorage.setItem("cooldown_until", (Date.now() + 60_000).toString());
    setIsBatchProcessing(true);
    setError(null);
    try {
      const res = await fetch("/api/jobs/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to dispatch batch jobs.");
      }
      const data: BatchJobAcceptedResponse = await res.json();
      const initialAssets: BatchAssetStatus[] = data.jobs.map((job) => ({
        ticker: job.ticker,
        job_id: job.job_id,
        status: "processing",
      }));
      setBatchId(data.batch_id);
      setBatchAssets(initialAssets);
      publish(data.batch_id, initialAssets);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Batch dispatch failed");
    } finally {
      setIsBatchProcessing(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-50">Runs</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Start a batch of research jobs here. A single stock run stays on that stock&apos;s Run tab.
        </p>
      </div>
      {error && (
        <p className="rounded-md border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
          {error}
        </p>
      )}
      <ActionTriggers
        ticker=""
        modeLock="batch"
        onDispatch={() => {}}
        onBatchDispatch={handleBatchDispatch}
        isProcessing={isBatchProcessing}
        cooldown={cooldown}
      />
      {batchId ? (
        <BatchCommandCenter
          batchId={batchId}
          assets={batchAssets}
          onSelectAsset={(symbol) => launchBikeTransition(symbol)}
          onClearBatch={() => {
            setBatchId(null);
            setBatchAssets([]);
            localStorage.removeItem("batch_id");
            localStorage.removeItem("batch_assets");
            publish(null, []);
          }}
        />
      ) : (
        <p className="text-sm text-slate-500">No batch is in progress.</p>
      )}
    </div>
  );
}
