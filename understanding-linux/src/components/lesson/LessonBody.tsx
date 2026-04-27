import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { CodeBlock } from './CodeBlock';
import type { ExtraProps } from 'react-markdown';
import type { ComponentPropsWithoutRef } from 'react';

type HeadingProps = ComponentPropsWithoutRef<'h2'> & ExtraProps;
type AnchorProps = ComponentPropsWithoutRef<'a'> & ExtraProps;
type ImgProps = ComponentPropsWithoutRef<'img'> & ExtraProps;
type CodeProps = ComponentPropsWithoutRef<'code'> & ExtraProps & { inline?: boolean };

function makeHeadingId(children: React.ReactNode): string {
  return String(children)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

const components = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  h2: ({ node: _node, children, ...props }: HeadingProps) => {
    const id = makeHeadingId(children);
    return <h2 id={id} {...props}>{children}</h2>;
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  h3: ({ node: _node, children, ...props }: HeadingProps) => {
    const id = makeHeadingId(children);
    return <h3 id={id} {...props}>{children}</h3>;
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  a: ({ node: _node, href, children, ...props }: AnchorProps) => (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  ),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  img: ({ node: _node, src, alt, ...props }: ImgProps) => (
    <img src={src} alt={alt} loading="lazy" className="rounded-xl max-w-full my-6" {...props} />
  ),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  code: ({ node: _node, inline, className, children, ...props }: CodeProps) => (
    <CodeBlock inline={inline} className={className} {...props}>
      {children}
    </CodeBlock>
  ),
};

interface LessonBodyProps {
  markdown: string;
}

export function LessonBody({ markdown }: LessonBodyProps) {
  return (
    <div className="prose-lesson">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components as Record<string, unknown>}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
