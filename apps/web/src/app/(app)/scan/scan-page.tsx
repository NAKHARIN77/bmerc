"use client";

import jsQR from "jsqr";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { Alert, Button, ButtonLink, Card, Field, Input, PageHeader } from "@/components/ui";

const CODE = /BMERC-[A-Z0-9]{4,16}/i;

/** Scan the QR label (camera) or type the code, then open the device history. */
export function ScanPage() {
  const router = useRouter();
  const fromUrl = useSearchParams().get("code");
  const video = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState<"starting" | "on" | "off">("starting");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const looking = useRef(false);

  const lookUp = useCallback(
    async (raw: string) => {
      const code = raw.match(CODE)?.[0]?.toUpperCase();
      if (!code) {
        setError("That is not a BMERC label. The code looks like BMERC-7K3QX9MD.");
        return;
      }
      if (looking.current) return;
      looking.current = true;
      setBusy(true);
      setError(null);
      try {
        const d = await api<{ id: string }>(`/devices/by-qr/${code}`);
        router.replace(`/devices/${d.id}`);
      } catch (e) {
        setError(errorMessage(e));
        looking.current = false;
        setBusy(false);
      }
    },
    [router],
  );

  // Opened from a phone camera: the label's URL carries the code.
  useEffect(() => {
    if (!fromUrl) return;
    const t = setTimeout(() => void lookUp(fromUrl), 0);
    return () => clearTimeout(t);
  }, [fromUrl, lookUp]);

  useEffect(() => {
    if (fromUrl) return;
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const tick = () => {
      const v = video.current;
      if (stopped || !v || !ctx) return;
      if (v.readyState >= 2 && v.videoWidth) {
        // A smaller frame decodes faster and is plenty for a label held up to the camera.
        const scale = Math.min(1, 640 / v.videoWidth);
        canvas.width = Math.round(v.videoWidth * scale);
        canvas.height = Math.round(v.videoHeight * scale);
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
        if (hit?.data && CODE.test(hit.data)) {
          void lookUp(hit.data);
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera API");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        setCamera("on");
        frame = requestAnimationFrame(tick);
      } catch {
        if (!stopped) setCamera("off");
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [fromUrl, lookUp]);

  return (
    <>
      <PageHeader
        title="Scan QR"
        subtitle="Scan the QR label on the device to see its repair history"
        actions={
          <ButtonLink href="/board" variant="secondary">
            Back to board
          </ButtonLink>
        }
      />
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="text-center">
          <div className="relative mb-4 flex h-[280px] items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-info bg-[#0b1a2c] text-muted">
            <video ref={video} muted playsInline className={`h-full w-full object-cover ${camera === "on" ? "" : "hidden"}`} />
            {camera !== "on" && (
              <span className="px-6 text-[#c9d6e5]">
                {fromUrl ? "Looking up the device…" : camera === "starting" ? "Starting camera…" : "Camera not available. Allow camera access, or type the code."}
              </span>
            )}
            {camera === "on" && <span className="pointer-events-none absolute inset-x-0 bottom-3 text-sm text-white drop-shadow">{busy ? "Found it. Opening…" : "Camera on: point at the QR label"}</span>}
          </div>
        </Card>
        <Card>
          <div className="mb-2 text-xs text-muted">Camera not working? Type the code instead.</div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void lookUp(typed);
            }}
          >
            <Field label="Or type the QR code">{(id) => <Input id={id} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="e.g. BMERC-7K3QX9MD" autoCapitalize="characters" />}</Field>
            <Button type="submit" variant="secondary" className="w-full" busy={busy}>
              Look up device
            </Button>
          </form>
          <p className="mt-4 text-[13px] text-muted">
            No label yet? <Link className="font-semibold text-info" href="/devices">Search by serial number</Link>
          </p>
        </Card>
      </div>
    </>
  );
}
