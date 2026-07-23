import React from "react";

/**
 * Padrão de desbloqueio (grade 3x3, estilo Android).
 * Valor guardado como string "1-2-3-6-9".
 */

const parse = (v?: string): number[] =>
  (v || "")
    .split("-")
    .map((n) => parseInt(n, 10))
    .filter((n) => n >= 1 && n <= 9);

// posições dos 9 pontos numa grade de 3 colunas
const pos = (i: number, size: number) => {
  const col = (i - 1) % 3;
  const row = Math.floor((i - 1) / 3);
  const pad = size / 6;
  const step = (size - pad * 2) / 2;
  return { x: pad + col * step, y: pad + row * step };
};

export const PatternLock: React.FC<{
  value?: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  size?: number;
}> = ({ value, onChange, readOnly = false, size = 180 }) => {
  const seq = parse(value);

  const toggle = (i: number) => {
    if (readOnly || !onChange) return;
    if (seq.includes(i)) return; // já usado
    onChange([...seq, i].join("-"));
  };

  const limpar = () => onChange?.("");

  return (
    <div className={readOnly ? "" : "inline-block"}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="rounded-xl bg-slate-50 ring-1 ring-slate-200"
      >
        {/* linhas conectando a sequência */}
        {seq.map((n, idx) => {
          if (idx === 0) return null;
          const a = pos(seq[idx - 1], size);
          const b = pos(n, size);
          return (
            <line
              key={idx}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="rgb(var(--brand-600))"
              strokeWidth={4}
              strokeLinecap="round"
            />
          );
        })}
        {/* pontos */}
        {Array.from({ length: 9 }, (_, k) => k + 1).map((i) => {
          const p = pos(i, size);
          const ordem = seq.indexOf(i);
          const ativo = ordem >= 0;
          return (
            <g key={i} onClick={() => toggle(i)} style={{ cursor: readOnly ? "default" : "pointer" }}>
              <circle cx={p.x} cy={p.y} r={size / 9} fill={ativo ? "rgb(var(--brand-600))" : "#cbd5e1"} />
              {ativo && (
                <text
                  x={p.x}
                  y={p.y + 4}
                  textAnchor="middle"
                  fontSize={size / 12}
                  fill="#fff"
                  fontWeight="bold"
                >
                  {ordem + 1}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {!readOnly && (
        <div className="mt-2 flex items-center gap-3">
          <button type="button" className="btn-secondary !py-1 text-xs" onClick={limpar}>
            Limpar
          </button>
          <span className="text-xs text-slate-500">
            {seq.length ? `Sequência: ${seq.join(" → ")}` : "Toque nos pontos na ordem do desenho"}
          </span>
        </div>
      )}
    </div>
  );
};
