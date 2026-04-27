import { useState, type ComponentPropsWithoutRef } from 'react';
import { Copy, Check } from 'lucide-react';

type CodeProps = ComponentPropsWithoutRef<'code'> & { inline?: boolean };

export function CodeBlock({ children, className, inline }: CodeProps) {
  const [copied, setCopied] = useState(false);

  if (inline) {
    return <code className={className}>{children}</code>;
  }

  const code = String(children).replace(/\n$/, '');
  const lang = (className ?? '').replace('language-', '') || 'text';

  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="relative group my-6">
      <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
        <span className="text-xs text-gray-400 font-mono opacity-70">{lang}</span>
        <button
          onClick={copy}
          className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-gray-400 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
          aria-label="Copy code"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
      <pre className={`${className ?? ''} rounded-xl !m-0`}>
        <code className={className}>{code}</code>
      </pre>
    </div>
  );
}
