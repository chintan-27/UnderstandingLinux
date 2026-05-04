import { useState, type ReactNode, isValidElement, Children } from 'react';
import { Copy, Check } from 'lucide-react';

function extractText(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (!node) return '';
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    if (props.children) return extractText(props.children);
  }
  return '';
}

function getLang(children: ReactNode): string {
  const child = Children.toArray(children)[0];
  if (isValidElement(child)) {
    const props = child.props as { className?: string };
    const cls = props.className ?? '';
    const match = cls.match(/language-(\S+)/);
    if (match) return match[1];
  }
  return 'text';
}

export function PreBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const lang = getLang(children);
  const code = extractText(children).replace(/\n$/, '');

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
      <pre className="rounded-xl !m-0">
        {children}
      </pre>
    </div>
  );
}
