import { useEffect, useId, useState } from "react";

export function MermaidBlock({ source }: { source: string }) {
  const id = useId().replace(/:/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "dark",
          themeVariables: {
            background: "#020617",
            mainBkg: "#111827",
            primaryColor: "#1f2937",
            primaryTextColor: "#e5e7eb",
            lineColor: "#a78bfa",
            tertiaryColor: "#0f172a",
          },
        });
        const result = await mermaid.render(`mermaid-${id}`, source.trim());
        if (!cancelled) {
          setSvg(result.svg);
          setError(null);
        }
      } catch (caught) {
        if (!cancelled) {
          setSvg(null);
          setError(caught instanceof Error ? caught.message : "Could not render Mermaid diagram");
        }
      }
    };

    void render();
    return () => {
      cancelled = true;
    };
  }, [id, source]);

  if (error) {
    return (
      <div className="my-3 rounded-md border border-amber-700/60 bg-amber-950/20 p-3">
        <div className="mb-2 text-xs font-semibold text-amber-200">Mermaid render failed</div>
        <pre className="overflow-auto whitespace-pre-wrap text-xs text-slate-200">{source}</pre>
      </div>
    );
  }

  if (!svg) {
    return <div className="my-3 rounded-md border border-slate-800 bg-slate-900 p-3 text-sm text-slate-400">Rendering diagram...</div>;
  }

  return (
    <div
      className="mermaid-render my-3 overflow-auto rounded-md border border-slate-800 bg-slate-950 p-3"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
