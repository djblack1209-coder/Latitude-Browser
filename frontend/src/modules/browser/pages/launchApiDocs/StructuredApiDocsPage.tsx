import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '../../../../shared/components'
import { LaunchDocsCodeBlock } from './LaunchDocsCodeBlock'
import {
  getStructuredApiSectionEndpoints,
  isStructuredApiEndpointDocId,
  STRUCTURED_API_ENDPOINT_DOC_MAP,
  STRUCTURED_API_SECTION_DOC_MAP,
  type StructuredApiDocId,
  type StructuredApiField,
  type StructuredApiMethod,
  type StructuredApiResponseCode,
  type StructuredApiSectionId,
} from './structuredApiDocs'

interface StructuredApiDocsPageProps {
  docId: StructuredApiDocId
  launchBaseUrl: string
  authHeader: string
  onOpenDoc: (id: StructuredApiDocId) => void
}

function MethodBadge({ method }: { method: StructuredApiMethod }) {
  const className = {
    GET: 'border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-success)]',
    POST: 'border-[var(--color-info)]/30 bg-[var(--color-info)]/10 text-[var(--color-info)]',
    PUT: 'border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 text-[var(--color-warning)]',
    DELETE: 'border-[var(--color-error)]/30 bg-[var(--color-error)]/10 text-[var(--color-error)]',
    WS: 'border-[var(--color-accent-border)] bg-[var(--color-accent-muted)] text-[var(--color-accent)]',
  }[method]

  return (
    <span className={`inline-flex h-6 items-center rounded-sm border px-2 font-mono text-[10px] font-semibold tracking-[0.14em] ${className}`}>
      {method}
    </span>
  )
}

function FieldTable({ fields }: { fields: StructuredApiField[] }) {
  if (!fields.length) {
    return (
      <div className="rounded-sm border border-dashed border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-4 py-3 font-mono text-xs uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
        No request parameters
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-sm border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
      <table className="w-full min-w-[680px] text-sm">
        <thead className="bg-[var(--color-bg-muted)] text-left">
          <tr>
            <th className="px-3 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">字段</th>
            <th className="px-3 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">位置</th>
            <th className="px-3 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">类型</th>
            <th className="px-3 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">必填</th>
            <th className="px-3 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">说明</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={`${field.location}-${field.name}`} className="border-t border-[var(--color-border-muted)]">
              <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-primary)]">{field.name}</td>
              <td className="px-3 py-2.5 text-[var(--color-text-secondary)]">{field.location}</td>
              <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-secondary)]">{field.type}</td>
              <td className="px-3 py-2.5 text-[var(--color-text-secondary)]">{field.required ? '是' : '否'}</td>
              <td className="px-3 py-2.5 leading-6 text-[var(--color-text-secondary)]">{field.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ResponseCodeTable({ items }: { items: StructuredApiResponseCode[] }) {
  return (
    <div className="overflow-x-auto rounded-sm border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
      <table className="w-full min-w-[420px] text-sm">
        <thead className="bg-[var(--color-bg-muted)] text-left">
          <tr>
            <th className="px-3 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">状态码</th>
            <th className="px-3 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">说明</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.code} className="border-t border-[var(--color-border-muted)]">
              <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-primary)]">{item.code}</td>
              <td className="px-3 py-2.5 leading-6 text-[var(--color-text-secondary)]">{item.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SectionTitle({ title, description }: { title: string, description?: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{title}</h2>
      {description ? <p className="max-w-3xl text-sm leading-6 text-[var(--color-text-secondary)]">{description}</p> : null}
    </div>
  )
}

function StructuredApiSectionPage({ docId, onOpenDoc }: { docId: StructuredApiSectionId; onOpenDoc: (id: StructuredApiDocId) => void }) {
  const section = STRUCTURED_API_SECTION_DOC_MAP[docId]
  const endpoints = getStructuredApiSectionEndpoints(docId)

  return (
    <article className="space-y-7">
      <header className="border-b border-[var(--color-border-default)] pb-5">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">API GROUP</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">{section.title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--color-text-secondary)]">{section.intro}</p>
      </header>

      <section className="space-y-3">
        <SectionTitle title="功能边界" />
        <ul className="divide-y divide-[var(--color-border-muted)] border-y border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
          {section.highlights.map((item) => (
            <li key={item} className="flex gap-3 px-3 py-3 text-sm leading-6 text-[var(--color-text-secondary)]">
              <span className="font-mono text-[var(--color-accent)]" aria-hidden="true">&gt;</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <SectionTitle title="接口索引" description={`${endpoints.length} 个端点。选择一行查看请求字段、示例和响应状态。`} />
        <div className="overflow-x-auto rounded-sm border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-[var(--color-bg-muted)] text-left">
              <tr>
                <th className="px-3 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">方法</th>
                <th className="px-3 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">路径</th>
                <th className="px-3 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">用途</th>
                <th className="px-3 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">详情</th>
              </tr>
            </thead>
            <tbody>
              {endpoints.map((endpoint) => (
                <tr key={endpoint.id} className="border-t border-[var(--color-border-muted)]">
                  <td className="px-3 py-3"><MethodBadge method={endpoint.method} /></td>
                  <td className="px-3 py-3 font-mono text-xs text-[var(--color-text-primary)]">{endpoint.path}</td>
                  <td className="px-3 py-3 leading-6 text-[var(--color-text-secondary)]">{endpoint.purpose}</td>
                  <td className="px-3 py-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onOpenDoc(endpoint.id)}
                      aria-label={`查看 ${endpoint.label} 接口详情`}
                      title={`查看 ${endpoint.label} 接口详情`}
                    >
                      查看详情
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </article>
  )
}

function StructuredApiDetailPage({
  docId,
  launchBaseUrl,
  authHeader,
  onOpenDoc,
}: {
  docId: Exclude<StructuredApiDocId, 'api-profiles-launch' | 'api-runtime' | 'api-automation'>
  launchBaseUrl: string
  authHeader: string
  onOpenDoc: (id: StructuredApiDocId) => void
}) {
  const endpoint = STRUCTURED_API_ENDPOINT_DOC_MAP[docId]

  return (
    <article className="space-y-7">
      <Button variant="secondary" size="sm" onClick={() => onOpenDoc(endpoint.parentId)} title="返回接口列表">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        返回接口列表
      </Button>

      <header className="border-b border-[var(--color-border-default)] pb-5">
        <div className="flex flex-wrap items-center gap-3">
          <MethodBadge method={endpoint.method} />
          <code className="font-mono text-xs text-[var(--color-text-secondary)]">{endpoint.path}</code>
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">{endpoint.label}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--color-text-secondary)]">{endpoint.description}</p>
      </header>

      <section className="space-y-3">
        <SectionTitle title="请求参数" />
        <FieldTable fields={endpoint.fields} />
      </section>

      {endpoint.requestExample ? (
        <section className="space-y-3">
          <SectionTitle title="请求示例" />
          <LaunchDocsCodeBlock language={endpoint.requestExample.language} code={endpoint.requestExample.code({ launchBaseUrl, authHeader })} />
        </section>
      ) : null}

      <section className="space-y-3">
        <SectionTitle title="状态码" />
        <ResponseCodeTable items={endpoint.responseCodes} />
      </section>

      {endpoint.responseExample ? (
        <section className="space-y-3">
          <SectionTitle title="成功响应示例" />
          <LaunchDocsCodeBlock language={endpoint.responseExample.language} code={endpoint.responseExample.code({ launchBaseUrl, authHeader })} />
        </section>
      ) : null}

      {endpoint.notes.length > 0 ? (
        <section className="border-y border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-4 py-3">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-warning)]">CAUTION</p>
          <ul className="mt-2 space-y-1.5 text-sm leading-6 text-[var(--color-text-secondary)]">
            {endpoint.notes.map((note) => <li key={note}>{note}</li>)}
          </ul>
        </section>
      ) : null}
    </article>
  )
}

export function StructuredApiDocsPage({ docId, launchBaseUrl, authHeader, onOpenDoc }: StructuredApiDocsPageProps) {
  if (isStructuredApiEndpointDocId(docId)) {
    return (
      <StructuredApiDetailPage
        docId={docId}
        launchBaseUrl={launchBaseUrl}
        authHeader={authHeader}
        onOpenDoc={onOpenDoc}
      />
    )
  }

  return <StructuredApiSectionPage docId={docId} onOpenDoc={onOpenDoc} />
}
