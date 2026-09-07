import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TelemetryStrip } from '../../../shared/components/SignalPrimitives'
import { useLaunchContext } from '../hooks/useLaunchContext'
import {
  DOC_GROUPS,
  findDocById,
  getAdjacentDocs,
  renderDocWithLaunchContext,
} from './launchApiDocs/catalog'
import { LaunchDocsFlowPage } from './launchApiDocs/LaunchDocsFlowPage'
import { LaunchDocsLayout } from './launchApiDocs/LaunchDocsLayout'
import { LaunchDocsMarkdownContent } from './launchApiDocs/LaunchDocsMarkdownContent'
import { LaunchDocsPager } from './launchApiDocs/LaunchDocsPager'
import { LaunchDocsSidebar } from './launchApiDocs/LaunchDocsSidebar'
import { StructuredApiDocsPage } from './launchApiDocs/StructuredApiDocsPage'
import { TechnicalDocsCenter } from './launchApiDocs/TechnicalDocsCenter'
import {
  getStructuredApiParentDocId,
  isStructuredApiDocId,
  isStructuredApiEndpointDocId,
  type StructuredApiDocId,
} from './launchApiDocs/structuredApiDocs'

export function LaunchApiDocsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedDoc = searchParams.get('doc')?.trim() || ''
  const [activeId, setActiveId] = useState<string | null>(() => {
    const doc = requestedDoc ? findDocById(requestedDoc) : null
    return doc?.id || null
  })
  const { launchBaseUrl, launchServerReady, launchContextLoading, apiAuth } = useLaunchContext()

  const activeDoc = activeId ? findDocById(activeId) : null
  const { previous, next } = activeDoc && !isStructuredApiEndpointDocId(activeDoc.id)
    ? getAdjacentDocs(activeDoc.id)
    : { previous: null, next: null }
  const sidebarActiveId = activeDoc
    ? isStructuredApiDocId(activeDoc.id) ? getStructuredApiParentDocId(activeDoc.id) : activeDoc.id
    : ''

  const selectDoc = (id: string, syncURL: boolean) => {
    const doc = findDocById(id)
    if (!doc) {
      return false
    }

    setActiveId(doc.id)
    if (syncURL) {
      setSearchParams({ doc: doc.id })
    }
    return true
  }

  const openCenter = () => {
    setActiveId(null)
    setSearchParams({})
  }

  useEffect(() => {
    if (!requestedDoc) {
      if (activeId !== null) {
        setActiveId(null)
      }
      return
    }

    const requested = findDocById(requestedDoc)
    if (!requested) {
      setSearchParams({})
      return
    }

    if (requested.id !== activeId) {
      setActiveId(requested.id)
    }
  }, [activeId, requestedDoc, setSearchParams])

  const renderedContent = activeDoc
    ? renderDocWithLaunchContext(activeDoc.content, launchBaseUrl, apiAuth.header)
    : ''
  const docCount = DOC_GROUPS.reduce((count, group) => count + group.items.length, 0)

  return (
    <LaunchDocsLayout
      sidebar={(
        <LaunchDocsSidebar
          groups={DOC_GROUPS}
          activeId={sidebarActiveId}
          onHome={openCenter}
          onSelect={(id) => {
            void selectDoc(id, true)
          }}
        />
      )}
      header={null}
      content={(
        <div className="apple-page space-y-6">
          <TelemetryStrip items={[
            {
              label: '服务端点',
              value: <code className="font-mono text-xs">{launchBaseUrl}</code>,
              detail: launchContextLoading ? '正在读取服务状态' : launchServerReady ? 'Launch API 已就绪' : 'Launch API 未就绪',
              tone: launchContextLoading ? 'neutral' : launchServerReady ? 'success' : 'warning',
            },
            {
              label: '认证',
              value: apiAuth.enabled ? '已启用' : '未启用',
              detail: apiAuth.enabled ? apiAuth.header : '请求无需 API Key',
              tone: apiAuth.enabled ? 'accent' : 'neutral',
            },
            {
              label: '当前文档',
              value: activeDoc?.label || '文档中心',
              detail: activeDoc?.id || 'technical-docs-center',
              tone: activeDoc ? 'accent' : 'neutral',
            },
            { label: '文档节点', value: docCount, detail: `${DOC_GROUPS.length} 个目录分组`, tone: 'neutral' },
          ]} />

          {activeDoc ? (
            activeDoc.id === 'tutorial-flow'
              ? <LaunchDocsFlowPage baseUrl={launchBaseUrl} />
              : isStructuredApiDocId(activeDoc.id)
                ? (
                  <StructuredApiDocsPage
                    docId={activeDoc.id as StructuredApiDocId}
                    launchBaseUrl={launchBaseUrl}
                    authHeader={apiAuth.header}
                    onOpenDoc={(id) => {
                      void selectDoc(id, true)
                    }}
                  />
                )
                : <LaunchDocsMarkdownContent content={renderedContent} docId={activeDoc.id} />
          ) : (
            <TechnicalDocsCenter groups={DOC_GROUPS} onOpenDoc={(id) => {
              void selectDoc(id, true)
            }} />
          )}

          {activeDoc ? (
            <LaunchDocsPager
              previous={previous}
              next={next}
              onSelect={(id) => {
                void selectDoc(id, true)
              }}
            />
          ) : null}
        </div>
      )}
    />
  )
}
