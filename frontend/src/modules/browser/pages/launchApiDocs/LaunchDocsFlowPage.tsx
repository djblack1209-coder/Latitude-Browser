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
  const steps: FlowStep[] = [
    {
      step: '01',
      title: '内核下载',
      summary: '先准备浏览器内核，并在应用里确认已识别。',
      path: '指纹浏览器 -> 内核管理 -> 下载内核 -> 设为默认',
      example: `chrome/
  chrome-<version>/
    chrome.exe`,
    },
    {
      step: '02',
      title: '代理绑定',
      summary: '先在代理池录入节点，再在实例上选择绑定。',
      path: '指纹浏览器 -> 代理池配置 -> 导入 Clash YAML / 录入 HTTP(S) / SOCKS5',
      example: `proxies:
  - name: hk-vless
    type: vless
    server: example.com
    port: 443`,
    },
    {
      step: '03',
      title: '实例创建',
      summary: '新建实例时选择内核、代理、关键字和启动码。',
      path: '指纹浏览器 -> 实例列表 -> 新建配置 -> 选择内核 / 代理 -> 保存',
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
      title: '实例触发',
      summary: '先在应用里手动启动一次，确认实例可以正常拉起。',
      path: '指纹浏览器 -> 实例列表 -> 启动',
      example: `GET ${baseUrl}/api/health
POST ${baseUrl}/api/launch`,
    },
    {
      step: '05',
      title: '接口调用',
      summary: '最后再接外部脚本或调度系统，按需接管 CDP。',
      path: '外部脚本 -> Latitude Browser Launch API -> 浏览器实例',
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
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">OPERATOR FLOW</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">从配置到调用</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--color-text-secondary)]">
          按顺序完成内核、代理、实例、首次启动和接口接入。
        </p>
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
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-muted)]">PATH</span>
                  <p className="mt-1.5 text-sm text-[var(--color-text-primary)]">{step.path}</p>
                </div>
                {step.example ? <LaunchDocsCodeBlock language={step.step === '02' ? 'yaml' : step.step === '03' ? 'json' : 'bash'} code={step.example} /> : null}
              </div>
            </section>
          ))}
        </div>
      </div>
    </article>
  )
}
