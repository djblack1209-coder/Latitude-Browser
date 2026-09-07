import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FolderOpen } from 'lucide-react'
import { BrowserOpenURL } from '../../../../wailsjs/runtime/runtime'
import { Button, toast } from '../../../../shared/components'
import { openProjectRoot } from '../../api/filesystem'
import { LaunchDocsCodeBlock } from './LaunchDocsCodeBlock'

export function LaunchDocsMarkdownContent({ content, docId }: { content: string; docId?: string }) {
  const showProjectRootAction = docId === 'tutorial-skill'

  return (
    <article className="max-w-[78ch] space-y-4">
      {showProjectRootAction ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2.5">
          <span className="text-sm text-[var(--color-text-secondary)]">安装命令默认相对项目根目录执行。</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              void openProjectRoot().catch((error: any) => {
                toast.error(error?.message || '打开根目录失败')
              })
            }}
            title="在文件管理器中打开项目根目录"
          >
            <FolderOpen className="h-4 w-4" aria-hidden="true" />
            打开根目录
          </Button>
        </div>
      ) : null}

      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-5 border-b border-[var(--color-border-default)] pb-4 text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-3 mt-8 border-t border-[var(--color-border-muted)] pt-5 text-lg font-semibold text-[var(--color-text-primary)]">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-6 text-base font-semibold text-[var(--color-text-primary)]">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="mb-3 text-[15px] leading-7 text-[var(--color-text-secondary)]">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="mb-4 list-disc space-y-1.5 pl-5 marker:text-[var(--color-accent)]">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-4 list-decimal space-y-1.5 pl-5 marker:font-mono marker:text-[var(--color-accent)]">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-[15px] leading-7 text-[var(--color-text-secondary)]">{children}</li>
          ),
          code: ({ children, className }) => {
            const isBlock = className?.includes('language-')
            if (isBlock) return <code className={className}>{children}</code>
            return (
              <code className="rounded-sm border border-[var(--color-border-muted)] bg-[var(--color-bg-muted)] px-1.5 py-0.5 font-mono text-xs text-[var(--color-accent)]">
                {children}
              </code>
            )
          },
          pre: ({ children }) => {
            const codeElement = (children as any)?.props
            const language = codeElement?.className?.replace('language-', '') || ''
            const codeText = Array.isArray(codeElement?.children)
              ? codeElement.children.join('')
              : String(codeElement?.children || '')
            return <LaunchDocsCodeBlock language={language} code={codeText} />
          },
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-sm border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)]">
              <table className="w-full text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="border-b border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2.5 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--color-text-muted)]">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border-t border-[var(--color-border-muted)] px-3 py-2.5 leading-6 text-[var(--color-text-secondary)]">{children}</td>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-4 border-y border-[var(--color-accent-border)] bg-[var(--color-accent-muted)] px-4 py-3 text-[var(--color-text-secondary)]">
              {children}
            </blockquote>
          ),
          strong: ({ children }) => <strong className="font-semibold text-[var(--color-text-primary)]">{children}</strong>,
          hr: () => <hr className="my-6 border-[var(--color-border-default)]" />,
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(event) => {
                event.preventDefault()
                if (href) BrowserOpenURL(href)
              }}
              className="cursor-pointer text-[var(--color-accent)] underline decoration-[var(--color-accent-border)] underline-offset-4 hover:decoration-[var(--color-accent)]"
              title={href}
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  )
}
