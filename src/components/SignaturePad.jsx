import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";

const SignaturePad = forwardRef(({ onChange }, ref) => {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const setup = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      const ctx = canvas.getContext("2d");
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctxRef.current = ctx;
    };
    setup();
    window.addEventListener("resize", setup);
    return () => window.removeEventListener("resize", setup);
  }, []);

  useImperativeHandle(ref, () => ({
    toFile: () =>
      new Promise((resolve, reject) => {
        canvasRef.current.toBlob((blob) => {
          if (!blob) return reject(new Error("No signature captured"));
          resolve(new File([blob], "signature.png", { type: "image/png" }));
        }, "image/png");
      }),
    clear: () => {
      const ctx = ctxRef.current;
      const canvas = canvasRef.current;
      if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasInk(false);
      onChange?.(false);
    },
  }));

  const pos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const down = (e) => {
    e.preventDefault();
    drawing.current = true;
    const p = pos(e);
    ctxRef.current.beginPath();
    ctxRef.current.moveTo(p.x, p.y);
  };

  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const p = pos(e);
    ctxRef.current.lineTo(p.x, p.y);
    ctxRef.current.stroke();
    if (!hasInk) {
      setHasInk(true);
      onChange?.(true);
    }
  };

  const up = () => {
    drawing.current = false;
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="w-full h-40 rounded-xl border-2 border-dashed bg-white touch-none cursor-crosshair"
        style={{ touchAction: "none" }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
      />
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-xs text-muted-foreground">Sign with a finger or Apple Pencil</span>
        <Button variant="ghost" size="sm" onClick={() => ref.current.clear()} disabled={!hasInk}>
          <Eraser className="w-3.5 h-3.5" /> Clear
        </Button>
      </div>
    </div>
  );
});

SignaturePad.displayName = "SignaturePad";

export default SignaturePad;