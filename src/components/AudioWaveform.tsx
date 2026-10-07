// Recovered from the September 17 deployment; see docs/SOURCE-RECOVERY.md.
import React from "react";
function AudioWaveform({ stream }: { stream: MediaStream }) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  return (
    React.useEffect(() => {
      const a = canvasRef.current,
        s = a == null ? void 0 : a.getContext("2d");
      if (!a || !s) return;
      const o = new AudioContext(),
        c = o.createMediaStreamSource(stream),
        h = o.createAnalyser();
      ((h.fftSize = 512), c.connect(h), o.resume());
      const d = new Uint8Array(h.fftSize);
      let g = 0;
      const y = () => {
        (h.getByteTimeDomainData(d),
          s.clearRect(0, 0, a.width, a.height),
          (s.strokeStyle = "#bb6240"),
          (s.lineWidth = 2),
          (s.lineCap = "round"),
          (s.lineJoin = "round"),
          s.beginPath(),
          d.forEach((m, v) => {
            const w = (v * a.width) / (d.length - 1),
              _ = (m / 255) * a.height;
            v === 0 ? s.moveTo(w, _) : s.lineTo(w, _);
          }),
          s.stroke(),
          (g = requestAnimationFrame(y)));
      };
      return (
        y(),
        () => {
          (cancelAnimationFrame(g), c.disconnect(), o.close());
        }
      );
    }, [stream]),
    (
      <canvas
        ref={canvasRef}
        width={600}
        height={100}
        className="h-20 w-full rounded-[20px] bg-fill"
        role="img"
        aria-label="Live microphone waveform"
      />
    )
  );
}
export { AudioWaveform };
