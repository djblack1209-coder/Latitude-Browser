import { tr, useLocale } from '../../../../shared/i18n'
import { LaunchDocsCodeBlock } from './LaunchDocsCodeBlock'

interface LaunchDocsFlowPageProps {
  baseUrl: string
}

interface FlowStep {
  step: string
  title: string
  summary: string
  path: string
  example?: string
}

export function LaunchDocsFlowPage({ baseUrl }: LaunchDocsFlowPageProps) {
  useLocale()

  const steps: FlowStep[] = [
    {
      step: '01',
      title: tr("browser.pages.launchApiDocs.LaunchDocsFlowPage.title.5613671"),
      summary: tr("browser.pages.launchApiDocs.LaunchDocsFlowPage.summary.6b08b6f"),
      path: tr("browser.pages.launchApiDocs.LaunchDocsFlowPage.path.f99aa58"),
      example: `chrome/
  chrome-<version>/
    chrome.exe`,
    },
    {
      step: '02',
      title: tr("browser.pages.launchApiDocs.LaunchDocsFlowPage.title.55e80d5"),
      summary: tr("browser.pages.launchApiDocs.LaunchDocsFlowPage.summary.1d8d03b"),
      path: tr("browser.pages.launchApiDocs.LaunchDocsFlowPage.path.c06d33a"),
      example: `proxies:
  - name: hk-vless
    type: vless
    server: example.com
    port: 443`,
    },
    {
      step: '03',
      title: tr("browser.pages.launchApiDocs.LaunchDocsFlowPage.title.37c86d3"),
      summary: tr("browser.pages.launchApiDocs.LaunchDocsFlowPage.summary.0a0c3cd"),
      path: tr("browser.pages.launchApiDocs.LaunchDocsFlowPage.path.9710aaf"),
      example: `{
  "profile": {
    "profileName": "buyer-001",
    "proxyId": "proxy-us",
    "keywords": ["buyer-001"]
  },
  "launchCode": "BUYER_001"
}`,
    },
    {
      step: '04',
      title: tr("browser.pages.launchApiDocs.LaunchDocsFlowPage.title.300f105"),
      summary: tr("browser.pages.launchApiDocs.LaunchDocsFlowPage.summary.82c4203"),
      path: tr("browser.pages.launchApiDocs.LaunchDocsFlowPage.path.0ab5fa8"),
      example: `GET ${baseUrl}/api/health
POST ${baseUrl}/api/launch`,
    },
    {
      step: '05',
      title: tr("browser.pages.launchApiDocs.LaunchDocsFlowPage.title.b11286a"),
      summary: tr("browser.pages.launchApiDocs.LaunchDocsFlowPage.summary.51bc547"),
      path: tr("browser.pages.launchApiDocs.LaunchDocsFlowPage.path.4ea8cfd"),
      example: `curl -X POST ${baseUrl}/api/runtime/session \\
  -H "Content-Type: application/json" \\
  -d '{
    "selector": { "code": "BUYER_001" },
    "skipDefaultStartUrls": true
  }'`,
    },
  ]

  return (
    <article className="space-y-7">
      <header className="border-b border-[var(--color-border-default)] pb-5">
        <p className="font-mono text-[10px] font-semibold   text-[var(--color-text-muted)]">{tr("ui.modules.browser.pages.launchApiDocs.LaunchDocsFlowPage.label.f70cdf9")}</p>
        <h1 className="remit-doc-title mt-2 text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">{tr("browser.pages.launchApiDocs.LaunchDocsFlowPage.text.2e6857e")}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--color-text-secondary)]">{tr("browser.pages.launchApiDocs.LaunchDocsFlowPage.text.0343909")}</p>
      </header>

      <div className="relative">
        <div className="absolute bottom-3 left-[15px] top-3 w-px bg-[var(--color-border-default)]" aria-hidden="true" />
        <div className="space-y-8">
          {steps.map((step) => (
            <section key={step.step} className="relative grid grid-cols-[32px_minmax(0,1fr)] gap-4">
              <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-sm border border-[var(--color-accent-border)] bg-[var(--color-bg-surface)] font-mono text-[11px] font-semibold text-[var(--color-accent)]">
                {step.step}
              </div>
              <div className="min-w-0 space-y-3 pb-1">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{step.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">{step.summary}</p>
                </div>
                <div className="border-y border-[var(--color-border-muted)] bg-[var(--color-bg-surface)] px-3 py-2.5">
                  <span className="font-mono text-[10px]   text-[var(--color-text-muted)]">{tr("ui.modules.browser.pages.launchApiDocs.LaunchDocsFlowPage.label.09bd6a3")}</span>
                  <p className="mt-1.5 text-sm text-[var(--color-text-primary)]">{step.path}</p>
                </div>
                {step.example ? <LaunchDocsCodeBlock language={step.step === '02' ? "yaml" : step.step === '03' ? "json" : "bash"} code={step.example} /> : null}
              </div>
            </section>
          ))}
        </div>
      </div>
    </article>
  )
}
