import React from "react";
import { X } from "lucide-react";
import { paraNumero, paraTexto } from "../lib/format";

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
  footer?: React.ReactNode;
}> = ({ open, onClose, title, children, maxWidth = "max-w-2xl", footer }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm">
      <div
        className={`my-8 w-full ${maxWidth} rounded-2xl bg-white shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-bold text-slate-800">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export const Field: React.FC<{
  label: string;
  children: React.ReactNode;
  className?: string;
}> = ({ label, children, className = "" }) => (
  <div className={className}>
    <label className="label">{label}</label>
    {children}
  </div>
);

export const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  hint?: string;
}> = ({ icon, title, hint }) => (
  <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-16 text-center">
    <div className="mb-3 text-slate-300">{icon}</div>
    <p className="font-semibold text-slate-600">{title}</p>
    {hint && <p className="mt-1 text-sm text-slate-400">{hint}</p>}
  </div>
);

export const SectionTitle: React.FC<{
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}> = ({ title, subtitle, action }) => (
  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
      {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
    </div>
    {action}
  </div>
);

/**
 * Campo numérico que deixa apagar o zero.
 *
 * Com `<input type="number">` controlado por `value={n}` e
 * `onChange={e => set(+e.target.value)}`, apagar o conteúdo virava zero na
 * mesma tecla — `+""` é 0 — e o campo reescrevia "0" na tela. Para trocar um
 * valor era preciso digitar outro número ANTES de apagar o antigo.
 *
 * Aqui o texto digitado é guardado como texto enquanto o campo está em uso,
 * e só vira número para quem chama. Campo vazio devolve `undefined`, e a
 * tela decide se isso é zero ou "não informado" — as duas coisas existem.
 *
 * É `type="text"` com `inputMode="decimal"` de propósito: o teclado do
 * celular é o mesmo, e some o comportamento do `type="number"` de mudar o
 * valor quando a roda do mouse passa por cima do campo.
 */
export const InputNumero: React.FC<{
  value?: number | null;
  onChange: (v: number | undefined) => void;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  min?: number;
  max?: number;
  onBlur?: () => void;
}> = ({ value, onChange, className, placeholder, autoFocus, disabled, min, max, onBlur }) => {
  const [texto, setTexto] = React.useState(() => paraTexto(value ?? undefined));

  // Só reescreve o campo quando o valor de fora REALMENTE mudou. Sem esta
  // guarda, digitar "1," seria substituído por "1" a cada tecla.
  React.useEffect(() => {
    const atual = paraNumero(texto);
    const vindo = value === null ? undefined : value;
    if (atual !== vindo) setTexto(paraTexto(vindo));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const digitou = (bruto: string) => {
    // Deixa passar só o que pode fazer parte de um número, para o campo não
    // aceitar letra e depois "esquecer" o que a pessoa digitou.
    const limpo = bruto.replace(/[^\d.,-]/g, "");
    setTexto(limpo);
    const n = paraNumero(limpo);
    if (n === undefined) return onChange(undefined);
    if (min !== undefined && n < min) return onChange(min);
    if (max !== undefined && n > max) return onChange(max);
    onChange(n);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      className={className || "input"}
      placeholder={placeholder}
      autoFocus={autoFocus}
      disabled={disabled}
      value={texto}
      onChange={(e) => digitou(e.target.value)}
      onBlur={() => {
        // Ao sair do campo, normaliza a exibição: "5," vira "5", e o que
        // ficou fora do limite aparece já corrigido.
        const n = paraNumero(texto);
        setTexto(paraTexto(n === undefined ? undefined : (value ?? n)));
        onBlur?.();
      }}
    />
  );
};
