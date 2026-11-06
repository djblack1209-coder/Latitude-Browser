import { useLocale } from '../../../shared/i18n'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
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
  useLocale()

  const [searchParams, setSearchParams] = useSearchParams()
  const requestedDoc = searchParams.get('doc')?.trim() || ''
  const [activeId, setActiveId] = useState<string | null>(() => {
    const doc = requestedDoc ? findDocById(requestedDoc) : null
    return doc?.id || null
  })
  const { launchBaseUrl, apiAuth } = useLaunchContext()

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
