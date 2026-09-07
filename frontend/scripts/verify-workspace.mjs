#!/usr/bin/env node

/**
 * Browser-mock workspace regression for Latitude Browser.
 *
 * This deliberately exercises the Vite/browser fallback where Wails' `window.go`
 * bridge is absent. It verifies frontend routing and safe in-memory fixtures; it
 * is not a backend or native-app integration test.
 *
 * The repository does not depend on Playwright. Point the script at an existing
 * Playwright node_modules directory, for example:
 *
 *   LATITUDE_PLAYWRIGHT_NODE_MODULES="$HOME/.npm/_npx/<id>/node_modules" \
 *   LATITUDE_VERIFY_URL=http://127.0.0.1:5218 \
 *   node frontend/scripts/verify-workspace.mjs --scope=smoke
 */

import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const frontendDir = resolve(scriptDir, '..')
const repoRoot = resolve(frontendDir, '..')
const localRequire = createRequire(import.meta.url)

function parseArgs(argv) {
  const options = {
    baseURL: process.env.LATITUDE_VERIFY_URL || process.env.BASE_URL || '',
    outputDir: process.env.LATITUDE_VERIFY_OUTPUT || '',
    scope: process.env.LATITUDE_VERIFY_SCOPE || 'full',
    headed: process.env.LATITUDE_VERIFY_HEADED === '1',
  }

  for (const arg of argv) {
    if (arg === '--headed') options.headed = true
    else if (arg === '--headless') options.headed = false
    else if (arg.startsWith('--url=')) options.baseURL = arg.slice('--url='.length)
    else if (arg.startsWith('--output=')) options.outputDir = arg.slice('--output='.length)
    else if (arg.startsWith('--scope=')) options.scope = arg.slice('--scope='.length)
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function printHelp() {
  console.log(`Usage: node frontend/scripts/verify-workspace.mjs [options]\n\nOptions:\n  --url=<url>       Running Vite preview URL (or LATITUDE_VERIFY_URL)\n  --scope=smoke     Desktop-dark route sweep plus operation fixtures\n  --scope=full      Dark/light route sweeps at 1440, 900, and 375 px (default)\n  --output=<dir>    Artifact directory (default: output/playwright/workspace-<time>)\n  --headed          Show Chromium while running\n  --headless        Force headless mode\n`)
}

function normalizeModuleRoots(value) {
  return String(value || '')
    .split(process.platform === 'win32' ? ';' : ':')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function resolveChromiumExecutable() {
  const candidates = [
    process.env.LATITUDE_VERIFY_CHROME,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  ].filter(Boolean)
  return candidates.find((candidate) => existsSync(candidate)) || ''
}

function loadPlaywright() {
  const attempts = []
  const tryRequire = (requireFn, label) => {
    for (const moduleName of ['playwright', 'playwright-core']) {
      try {
        const loaded = requireFn(moduleName)
        if (loaded?.chromium) return { playwright: loaded, source: `${label}:${moduleName}` }
      } catch (error) {
        attempts.push(`${label}:${moduleName} (${error?.code || error?.message || 'unavailable'})`)
      }
    }
    return null
  }

  const local = tryRequire(localRequire, 'local')
  if (local) return local

  const roots = [
    ...normalizeModuleRoots(process.env.LATITUDE_PLAYWRIGHT_NODE_MODULES),
    ...normalizeModuleRoots(process.env.PLAYWRIGHT_NODE_MODULES),
    ...normalizeModuleRoots(process.env.NODE_PATH),
  ]

  for (const root of [...new Set(roots)]) {
    const anchor = existsSync(root) && basename(root) === 'node_modules'
      ? join(dirname(root), '__latitude_verify__.cjs')
      : join(root, '__latitude_verify__.cjs')
    const external = tryRequire(createRequire(pathToFileURL(anchor)), `external:${root}`)
    if (external) return external
  }

  throw new Error([
    'Playwright is not a frontend dependency and no external module root was provided.',
    'Set LATITUDE_PLAYWRIGHT_NODE_MODULES to an existing node_modules directory containing playwright.',
    'Example:',
    '  LATITUDE_PLAYWRIGHT_NODE_MODULES="$HOME/.npm/_npx/<id>/node_modules" \\',
    '  LATITUDE_VERIFY_URL=http://127.0.0.1:5218 \\',
    '  node frontend/scripts/verify-workspace.mjs --scope=smoke',
    '',
    `Resolution attempts: ${attempts.join('; ')}`,
  ].join('\n'))
}

function normalizeBaseURL(value) {
  if (!value) {
    throw new Error('Missing Vite server URL. Pass --url=<url> or set LATITUDE_VERIFY_URL.')
  }
  const parsed = new URL(value)
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Unsupported URL protocol: ${parsed.protocol}`)
  }
  parsed.pathname = parsed.pathname.replace(/\/$/, '') || '/'
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString().replace(/\/$/, '')
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function loadWorkspaceRoutes() {
  const navigationPath = join(frontendDir, 'src', 'config', 'navigation.config.ts')
  const settingsSectionsPath = join(frontendDir, 'src', 'modules', 'settings', 'components', 'SettingsSectionNav.tsx')
  const [navigationSource, settingsSource] = await Promise.all([
    readFile(navigationPath, 'utf8'),
    readFile(settingsSectionsPath, 'utf8').catch(() => ''),
  ])
  const routeDefinitions = [
    { source: navigationSource, pattern: /name:\s*'([^']+)'\s*,\s*path:\s*'([^']+)'/g },
    { source: settingsSource, pattern: /label:\s*'([^']+)'\s*,\s*to:\s*'([^']+)'/g },
  ]
  const routes = []
  const seen = new Set()
  for (const { source, pattern } of routeDefinitions) {
    for (const match of source.matchAll(pattern)) {
      const [, name, path] = match
      if (!path.startsWith('/') || seen.has(path)) continue
      seen.add(path)
      routes.push({ name, path })
    }
  }
  if (routes.length < 10) {
    throw new Error(`Parsed only ${routes.length} workspace routes; navigation format may have changed.`)
  }
  return routes
}

const baseHeadingPatterns = new Map([
  ['/browser/auto-config', /自动配置|创建可验证的浏览器实例/],
  ['/browser/list', /实例|浏览器配置/],
  ['/browser/proxy-pool', /代理池|代理管理/],
  ['/settings', /系统设置|全局设置|设置/],
  ['/browser/logs', /日志|诊断|运行记录|网络/],
  ['/browser/cores', /内核/],
  ['/browser/extensions', /插件|扩展/],
  ['/browser/bookmarks', /书签/],
  ['/browser/automation', /自动化|脚本/],
  ['/system/docs', /文档|教程|API|接入/],
])

const queryExpectations = new Map([
  ['/browser/list?sort=recent', { heading: /最近活动/, state: /最近|最近启动|最近更新|时间/ }],
  ['/browser/list?status=attention', { heading: /需要处理|待处理|冲突/, state: /需要处理|待处理|冲突|异常|警告/ }],
  ['/settings?section=connectors', { heading: /连接栈/, state: /Xray|Mihomo|sing-box|连接器/ }],
  ['/settings?section=tor', { heading: /Tor 实验室|Tor/, state: /Tor|实验|桥接|出口|路由/ }],
  ['/settings?section=runtime', { heading: /自动化运行时/, state: /Node|脚本|运行时|本地 API/ }],
  ['/settings?section=storage', { heading: /备份与数据/, state: /备份|导出|恢复|初始化|加载/ }],
  ['/browser/logs?view=network', { heading: /网络诊断/, state: /网络|连通|代理|连接/ }],
  ['/browser/list?view=templates', { heading: /指纹配置来源|指纹模板/, state: /模板|指纹|配置来源/ }],
  ['/browser/logs?view=runs', { heading: /运行相关日志|运行记录/, state: /运行|脚本|记录|任务/ }],
])

const controlPatterns = new Map([
  ['/browser/auto-config', /下一步|返回实例|读取|使用代理|直连/],
  ['/browser/list', /新建实例|筛选|刷新|启动|停止/],
  ['/browser/proxy-pool', /新增|添加|导入|刷新|检测|测速/],
  ['/settings', /保存|重置|主题|连接|导出|加载|初始化|刷新|检测|启动|停止/],
  ['/browser/logs', /刷新|清空|重置筛选|筛选/],
  ['/browser/cores', /下载内核|导入本地|扫描内核|新增内核/],
  ['/browser/extensions', /查询|下载|导入|添加|代理/],
  ['/browser/bookmarks', /保存|添加书签|手动同步|恢复默认/],
  ['/browser/automation', /新建|导入|刷新|脚本|运行/],
  ['/system/docs', /复制|运行|创建|启动|删除|文档/],
])

function routeExpectation(route) {
  const parsed = new URL(route.path, 'http://latitude.local')
  const query = queryExpectations.get(route.path)
  return {
    pathname: parsed.pathname,
    heading: query?.heading || baseHeadingPatterns.get(parsed.pathname) || new RegExp(escapeRegExp(route.name), 'i'),
    queryState: query?.state || null,
    control: controlPatterns.get(parsed.pathname) || /.+/,
  }
}

function artifactName(value) {
  return value
    .replace(/^\//, '')
    .replace(/[?&=/:]+/g, '-')
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '') || 'root'
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function readViteOverlay(page) {
  return page.locator('vite-error-overlay').evaluate((overlay) => (
    overlay.shadowRoot?.textContent || overlay.textContent || 'Vite error overlay is visible'
  )).catch(() => 'Vite error overlay is visible')
}

async function waitForWorkspace(page) {
  const overlay = page.locator('vite-error-overlay')
  const booted = page.waitForFunction(() => window.__ANT_APP_BOOTED__ === true, null, { timeout: 15_000 }).then(() => 'booted')
  const viteFailed = overlay.waitFor({ state: 'attached', timeout: 15_000 }).then(() => 'vite-error').catch(() => new Promise(() => {}))
  const outcome = await Promise.race([booted, viteFailed])
  if (outcome === 'vite-error') throw new Error(await readViteOverlay(page))

  const main = page.locator('main').first()
  const shellOutcome = await Promise.race([
    main.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'main'),
    overlay.waitFor({ state: 'attached', timeout: 15_000 }).then(() => 'vite-error').catch(() => new Promise(() => {})),
  ])
  if (shellOutcome === 'vite-error') throw new Error(await readViteOverlay(page))
  const contentOutcome = await Promise.race([
    page.waitForFunction(() => {
      const mainNode = document.querySelector('main')
      return Boolean(mainNode && !mainNode.textContent?.includes('页面加载中...'))
    }, null, { timeout: 15_000 }).then(() => 'ready'),
    overlay.waitFor({ state: 'attached', timeout: 15_000 }).then(() => 'vite-error').catch(() => new Promise(() => {})),
  ])
  if (contentOutcome === 'vite-error' || await overlay.count()) throw new Error(await readViteOverlay(page))
  await page.waitForTimeout(180)
  return main
}

async function assertBrowserMock(page) {
  const bridge = await page.evaluate(() => ({
    go: Boolean(window.go?.main?.App),
    runtime: Boolean(window.runtime),
  }))
  assert(!bridge.go, 'Wails window.go bridge is present; refusing to run browser-mock fixtures against a native/backend session.')
  return bridge
}

async function inspectRoute(page, route, variant, outputDir) {
  const routeErrors = []
  const consoleErrors = []
  const onPageError = (error) => routeErrors.push(error?.stack || error?.message || String(error))
  const onConsole = (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  }
  page.on('pageerror', onPageError)
  page.on('console', onConsole)

  const target = new URL(route.path, variant.baseURL).toString()
  const startedAt = Date.now()
  let result
  try {
    const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 20_000 })
    assert(response === null || response.ok(), `Navigation returned HTTP ${response?.status()} for ${target}`)
    const main = await waitForWorkspace(page)
    const bridge = await assertBrowserMock(page)

    if (variant.collapseSidebar) {
      const collapse = page.getByRole('button', { name: '收起侧边栏' })
      if (await collapse.isVisible().catch(() => false)) {
        await collapse.click()
        await page.waitForTimeout(220)
      }
    }

    const current = new URL(page.url())
    const expected = routeExpectation(route)
    assert(current.pathname === expected.pathname, `Expected pathname ${expected.pathname}, got ${current.pathname}`)
    const expectedSearch = new URL(route.path, variant.baseURL).search
    assert(current.search === expectedSearch, `Expected query ${expectedSearch || '(empty)'}, got ${current.search || '(empty)'}`)

    const headingTexts = (await main.locator('h1, h2, [role="heading"]').allTextContents())
      .map((text) => text.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
    assert(
      headingTexts.some((text) => expected.heading.test(text)),
      `Missing query/page heading ${expected.heading}; headings: ${headingTexts.join(' | ') || '(none)'}`,
    )

    const mainText = (await main.innerText()).replace(/\s+/g, ' ').trim()
    if (expected.queryState) {
      assert(expected.queryState.test(mainText), `Missing query-state evidence ${expected.queryState} in main content.`)
    }

    const activeHrefs = await page.locator('a[aria-current="page"]').evaluateAll((nodes) => (
      nodes.map((node) => `${node.getAttribute('href') || ''}`)
    ))
    const pageOrigin = current.origin
    assert(
      activeHrefs.some((href) => {
        const active = new URL(href, pageOrigin)
        return `${active.pathname}${active.search}` === route.path
      }),
      `Navigation did not mark ${route.path} active; active hrefs: ${activeHrefs.join(', ') || '(none)'}`,
    )

    const controls = await main.locator('button, a[href], input, select, textarea, [role="button"], [role="tab"]').evaluateAll((nodes) => (
      nodes
        .filter((node) => {
          const style = getComputedStyle(node)
          const rect = node.getBoundingClientRect()
          return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0
        })
        .map((node) => ({
          text: `${node.getAttribute('aria-label') || node.getAttribute('title') || node.textContent || ''}`.replace(/\s+/g, ' ').trim(),
          tag: node.tagName.toLowerCase(),
        }))
    ))
    assert(controls.length > 0, 'Main content has no visible interactive controls.')
    assert(
      controls.some((control) => expected.control.test(control.text)),
      `Expected control ${expected.control} not found; controls: ${controls.map((item) => item.text).filter(Boolean).slice(0, 20).join(' | ')}`,
    )

    const layout = await page.evaluate(() => {
      const root = document.documentElement
      const body = document.body
      const mainNode = document.querySelector('main')
      const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
      return {
        clientWidth: root.clientWidth,
        documentScrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
        mainClientWidth: mainNode?.clientWidth || 0,
        mainScrollWidth: mainNode?.scrollWidth || 0,
        theme: root.getAttribute('data-theme'),
        reduceMotion,
      }
    })
    assert(layout.documentScrollWidth <= layout.clientWidth + 1, `Document horizontally overflows: ${layout.documentScrollWidth}px > ${layout.clientWidth}px.`)
    assert(layout.theme === variant.theme, `Expected ${variant.theme} theme, got ${layout.theme || '(unset)'}.`)
    assert(layout.reduceMotion, 'prefers-reduced-motion is not active.')

    let globe = null
    if (expected.pathname === '/browser/proxy-pool') {
      const globeFigure = main.locator('figure.signal-globe').first()
      await globeFigure.waitFor({ state: 'visible', timeout: 10_000 })
      await page.waitForFunction((element) => element?.getAttribute('data-renderer') === 'cobe', await globeFigure.elementHandle(), { timeout: 8_000 }).catch(() => {})
      globe = await globeFigure.evaluate((element) => ({
        renderer: element.getAttribute('data-renderer'),
        motion: element.getAttribute('data-motion'),
        hasPauseControl: Boolean(element.querySelector('button[aria-label*="地球动画"]')),
      }))
      assert(['cobe', 'static'].includes(globe.renderer), `Unexpected globe renderer: ${globe.renderer || '(unset)'}`)
      assert(globe.motion === 'still', `Reduced-motion globe must be still, got ${globe.motion || '(unset)'}.`)
      assert(!globe.hasPauseControl, 'Reduced-motion globe unexpectedly exposes an animation pause control.')
    }

    const screenshot = join(outputDir, variant.id, `${artifactName(route.path)}.png`)
    await mkdir(dirname(screenshot), { recursive: true })
    await page.screenshot({ path: screenshot, fullPage: false, animations: 'disabled' })

    assert(routeErrors.length === 0, `Page errors: ${routeErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `console.error: ${consoleErrors.join(' | ')}`)

    result = {
      ok: true,
      route: route.path,
      label: route.name,
      variant: variant.id,
      durationMs: Date.now() - startedAt,
      headings: headingTexts,
      controls: controls.length,
      layout,
      bridge,
      globe,
      screenshot,
    }
  } catch (error) {
    const failureScreenshot = join(outputDir, variant.id, `${artifactName(route.path)}-FAIL.png`)
    await mkdir(dirname(failureScreenshot), { recursive: true })
    await page.screenshot({ path: failureScreenshot, fullPage: false, animations: 'disabled' }).catch(() => {})
    result = {
      ok: false,
      route: route.path,
      label: route.name,
      variant: variant.id,
      durationMs: Date.now() - startedAt,
      error: routeErrors.length > 0
        ? `Page errors: ${routeErrors.join(' | ')}`
        : (error?.stack || error?.message || String(error)),
      pageErrors: routeErrors,
      consoleErrors,
      screenshot: failureScreenshot,
    }
  } finally {
    page.off('pageerror', onPageError)
    page.off('console', onConsole)
  }
  return result
}

async function openWorkspaceRoute(page, baseURL, path) {
  const response = await page.goto(new URL(path, baseURL).toString(), { waitUntil: 'domcontentloaded', timeout: 20_000 })
  assert(response === null || response.ok(), `Navigation returned HTTP ${response?.status()} for ${path}`)
  await waitForWorkspace(page)
  await assertBrowserMock(page)
}

async function runOperationFixtures(browser, baseURL, outputDir) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  })
  const baseOrigin = new URL(baseURL).origin
  await context.route('**/*', async (route) => {
    const requestURL = new URL(route.request().url())
    if (!['http:', 'https:'].includes(requestURL.protocol) || requestURL.origin === baseOrigin) {
      await route.continue()
    } else {
      await route.abort('blockedbyclient')
    }
  })
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return
    localStorage.setItem('app-theme', 'dark')
    localStorage.setItem('browser:viewMode', 'table')
    localStorage.setItem('browser:headerCollapsed', 'false')
    localStorage.removeItem('browser:filters')
  })

  const page = await context.newPage()

  // Settings drafts need the desktop code path so the connector radios and Tor
  // path input are enabled. Keep this bridge in a separate context so the
  // browser-mock fixtures above remain an honest no-bridge regression.
  const settingsContext = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  })
  await settingsContext.route('**/*', async (route) => {
    const requestURL = new URL(route.request().url())
    if (!['http:', 'https:'].includes(requestURL.protocol) || requestURL.origin === baseOrigin) {
      await route.continue()
    } else {
      await route.abort('blockedbyclient')
    }
  })
  await settingsContext.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return
    localStorage.setItem('app-theme', 'dark')
    localStorage.removeItem('app_settings')
    const fixtureState = {
      defaultConnectorType: 'xray',
      torPath: '',
      getBrowserSettingsCalls: 0,
      saveBrowserSettingsCalls: 0,
      getTorStatusCalls: 0,
      setTorRuntimePathCalls: 0,
      forceQuitCalls: 0,
      quitAppOnlyCalls: 0,
      nativeQuitCalls: 0,
    }
    const closeEventHandlers = new Map()
    const registerEvent = (name, handler) => {
      const handlers = closeEventHandlers.get(name) || new Set()
      handlers.add(handler)
      closeEventHandlers.set(name, handlers)
      return () => handlers.delete(handler)
    }
    window.__LATITUDE_EMIT_CLOSE_FIXTURE__ = () => {
      for (const handler of closeEventHandlers.get('app:request-close') || []) handler()
    }
    const torStatus = () => ({
      experimental: true,
      productionReady: false,
      configured: Boolean(fixtureState.torPath),
      binaryPath: fixtureState.torPath,
      binaryValid: Boolean(fixtureState.torPath),
      activeProfiles: [],
      message: 'Verifier fixture: Tor runtime is available for draft testing only.',
      available: true,
    })
    const app = new Proxy({}, {
      get(_target, property) {
        const name = String(property)
        return async (...args) => {
          if (name === 'GetBrowserSettings') {
            fixtureState.getBrowserSettingsCalls += 1
            return {
              userDataRoot: 'data', defaultFingerprintArgs: [], defaultLaunchArgs: [], defaultStartUrls: [],
              lightStartEnabled: true, restoreLastSession: false, startReadyTimeoutMs: 3000,
              startStableWindowMs: 1200, defaultConnectorType: fixtureState.defaultConnectorType,
            }
          }
          if (name === 'SaveBrowserSettings') {
            fixtureState.saveBrowserSettingsCalls += 1
            fixtureState.defaultConnectorType = args[0]?.defaultConnectorType === 'mihomo' ? 'mihomo' : 'xray'
            return true
          }
          if (name === 'BrowserProfileList') return []
          if (name === 'BrowserProxyCoreStatus') {
            const input = args[0] || {}
            return {
              core: input.core || 'xray', goos: input.goos || 'darwin', goarch: input.goarch || 'arm64',
              installed: true, configured: true, active: false, binaryPath: `/fixture/${input.core || 'xray'}`,
              source: 'verify-workspace-settings-fixture', message: 'Verifier fixture: installed component',
            }
          }
          if (name === 'GetTorStatus') {
            fixtureState.getTorStatusCalls += 1
            return torStatus()
          }
          if (name === 'SetTorRuntimePath') {
            fixtureState.setTorRuntimePathCalls += 1
            fixtureState.torPath = String(args[0] || '').trim()
            return torStatus()
          }
          if (name === 'ForceQuit' || name === 'QuitAppOnly') {
            if (name === 'ForceQuit') fixtureState.forceQuitCalls += 1
            else fixtureState.quitAppOnlyCalls += 1
            throw new Error('Verifier fixture: managed process stop is unconfirmed; quit was rejected.')
          }
          if (name === 'GetAutomationState') return {}
          if (name === 'GetLaunchServerInfo') return { host: '127.0.0.1', port: 19876, preferredPort: 19876, ready: false, baseUrl: '' }
          return null
        }
      },
    })
    window.__LATITUDE_SETTINGS_FIXTURE_STATE__ = fixtureState
    window.runtime = {
      Environment: async () => ({ platform: 'darwin', arch: 'arm64' }),
      EventsOn: registerEvent,
      EventsOnMultiple: registerEvent,
      EventsOff: (name) => closeEventHandlers.delete(name),
      WindowMinimise: () => {},
      WindowHide: () => {},
      Quit: () => { fixtureState.nativeQuitCalls += 1 },
    }
    window.go = { main: { App: app } }
  })
  const settingsPage = await settingsContext.newPage()
  const results = []
  const record = async (fixture, run, targetPage = page) => {
    const startedAt = Date.now()
    const screenshot = join(outputDir, 'operations', `${artifactName(fixture)}.png`)
    try {
      const details = await run()
      await mkdir(dirname(screenshot), { recursive: true })
      await targetPage.screenshot({ path: screenshot, animations: 'disabled' })
      results.push({ ok: true, fixture, durationMs: Date.now() - startedAt, details: details || null, screenshot })
      return true
    } catch (error) {
      const failureScreenshot = join(outputDir, 'operations', `${artifactName(fixture)}-FAIL.png`)
      await mkdir(dirname(failureScreenshot), { recursive: true })
      await targetPage.screenshot({ path: failureScreenshot, animations: 'disabled' }).catch(() => {})
      results.push({ ok: false, fixture, durationMs: Date.now() - startedAt, error: error?.stack || String(error), screenshot: failureScreenshot })
      return false
    }
  }

  try {
    await record('keyboard-navigation-and-view-mode', async () => {
      await openWorkspaceRoute(page, baseURL, '/browser/list')
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      })
      await page.keyboard.press('Tab')
      const skipFocus = await page.evaluate(() => ({
        tag: document.activeElement?.tagName || '',
        text: document.activeElement?.textContent?.trim() || '',
        href: document.activeElement?.getAttribute('href') || '',
      }))
      assert(skipFocus.tag === 'A' && skipFocus.href === '#workspace-content', `First keyboard focus is not the skip link: ${JSON.stringify(skipFocus)}`)
      await page.keyboard.press('Enter')
      const mainFocused = await page.evaluate(() => document.activeElement?.id === 'workspace-content')
      assert(mainFocused, 'Skip link did not focus the main workspace content.')

      const cardView = page.getByRole('button', { name: '卡片视图' })
      const tableView = page.getByRole('button', { name: '表格视图' })
      await cardView.focus()
      await page.keyboard.press('Enter')
      assert(await cardView.getAttribute('aria-pressed') === 'true', 'Enter did not activate card view.')
      await tableView.focus()
      await page.keyboard.press('Space')
      assert(await tableView.getAttribute('aria-pressed') === 'true', 'Space did not restore table view.')
      return { skipFocus, mainFocused, keyboardActivatedViewModes: ['card', 'table'] }
    })

    const profileName = '默认指纹配置'
    await record('mock-profile-start', async () => {
      await openWorkspaceRoute(page, baseURL, '/browser/list')
      const start = page.getByRole('button', { name: `启动实例：${profileName}` })
      await start.waitFor({ state: 'visible', timeout: 10_000 })
      await start.click()
      const stop = page.getByRole('button', { name: `停止实例：${profileName}` })
      await stop.waitFor({ state: 'visible', timeout: 10_000 })
      assert(await page.getByText('运行中', { exact: true }).first().isVisible(), 'Mock instance did not enter the running state.')
      return { sourceFixture: profileName, state: 'running' }
    })

    await record('mock-profile-stop', async () => {
      const stop = page.getByRole('button', { name: `停止实例：${profileName}` })
      await stop.waitFor({ state: 'visible', timeout: 10_000 })
      await stop.click()
      const start = page.getByRole('button', { name: `启动实例：${profileName}` })
      await start.waitFor({ state: 'visible', timeout: 10_000 })
      await page.getByText('实例已停止', { exact: false }).waitFor({ state: 'visible', timeout: 10_000 })
      assert(await start.isVisible(), 'Mock instance start control did not return after stopping.')
      return { sourceFixture: profileName, state: 'stopped', activityProduced: 'lastStopAt' }
    })

    await record('workspace-mode-calculations', async () => {
      const more = page.locator('aside button[aria-controls="sidebar-secondary-nav"]')
      if (await more.getAttribute('aria-expanded') !== 'true') await more.click()

      await page.locator('aside a[href="/browser/list?sort=recent"]').click()
      await page.waitForURL('**/browser/list?sort=recent')
      const recentMain = await waitForWorkspace(page)
      await recentMain.getByRole('heading', { name: '最近活动' }).waitFor({ state: 'visible' })
      await recentMain.getByText(/最近停止/).waitFor({ state: 'visible' })
      const recentTelemetry = await recentMain.locator('.signal-telemetry-item').filter({ hasText: '有使用记录' }).first().innerText()
      assert(/有使用记录\s*1(?:\D|$)/.test(recentTelemetry.replace(/\s+/g, ' ')), `Recent-mode calculation did not count the stopped fixture: ${recentTelemetry}`)

      await page.locator('aside a[href="/browser/list?status=attention"]').click()
      await page.waitForURL('**/browser/list?status=attention')
      const attentionMain = await waitForWorkspace(page)
      await attentionMain.getByRole('heading', { name: '需要处理' }).waitFor({ state: 'visible' })
      await attentionMain.getByText(profileName, { exact: true }).first().waitFor({ state: 'visible' })
      await attentionMain.getByText(/未找到可用浏览器内核/).first().waitFor({ state: 'visible' })

      await page.locator('aside a[href="/browser/list?view=templates"]').click()
      await page.waitForURL('**/browser/list?view=templates')
      const templatesMain = await waitForWorkspace(page)
      await templatesMain.getByRole('heading', { name: '指纹配置来源' }).waitFor({ state: 'visible' })
      await templatesMain.getByText(profileName, { exact: true }).first().waitFor({ state: 'visible' })
      await templatesMain.getByText('2 条显式指纹参数', { exact: true }).waitFor({ state: 'visible' })
      return {
        sourceFixture: profileName,
        recent: { expectedActivity: '最近停止', expectedRecordedCount: 1 },
        attention: { expectedReason: '未找到可用浏览器内核' },
        templates: { expectedFingerprintArgumentCount: 2 },
      }
    })

    await record('mock-tor-profile-roundtrip', async () => {
      const fixtureName = 'Latitude Tor fixture'
      const conflictingProxy = 'http://127.0.0.1:17890'

      await page.locator('a[href="/browser/edit/new"]').first().click()
      await page.waitForURL('**/browser/edit/new')
      const createMain = await waitForWorkspace(page)
      await createMain.getByRole('heading', { name: '新建配置' }).waitFor({ state: 'visible' })
      await createMain.getByPlaceholder('请输入配置名称').fill(fixtureName)

      const proxySource = createMain.getByRole('combobox', { name: '代理来源' })
      await proxySource.selectOption('local')
      const localProxy = createMain.getByPlaceholder('http://127.0.0.1:7890')
      await localProxy.fill(conflictingProxy)
      assert(await localProxy.inputValue() === conflictingProxy, 'Local proxy conflict fixture was not entered.')

      const torMode = createMain.getByRole('radio', { name: /Tor TCP 路由/ })
      await torMode.click()
      const confirm = page.getByRole('dialog').filter({ hasText: '切换到 Tor TCP 路由？' })
      await confirm.waitFor({ state: 'visible' })
      await confirm.getByText(/本地代理.*将被清空|代理池、本地代理或直连项将被清空/).waitFor({ state: 'visible' })
      await confirm.getByRole('button', { name: '清空并切换', exact: true }).click()

      assert(await torMode.getAttribute('aria-checked') === 'true', 'Tor network mode was not selected after confirmation.')
      const clearedProxy = createMain.getByRole('combobox', { name: '代理地址选择' })
      assert(await clearedProxy.isDisabled(), 'Regular proxy selector must be disabled in Tor mode.')
      assert(await clearedProxy.inputValue() === '', `Tor mode retained a conflicting proxy value: ${await clearedProxy.inputValue()}`)
      await createMain.getByText(/Tor 模式已清空并锁定常规代理选项/).waitFor({ state: 'visible' })

      await createMain.getByRole('button', { name: '保存配置', exact: true }).click()
      await page.waitForURL('**/browser/list')
      const listMain = await waitForWorkspace(page)
      await listMain.getByText(fixtureName, { exact: true }).first().waitFor({ state: 'visible' })
      await listMain.locator(`a[href^="/browser/detail/"]`, { hasText: fixtureName }).first().click()
      await page.waitForURL('**/browser/detail/*')

      const detailMain = await waitForWorkspace(page)
      await detailMain.getByText('Tor 实验性模式', { exact: true }).waitFor({ state: 'visible' })
      await detailMain.getByText('Tor TCP 路由（实验性）', { exact: true }).waitFor({ state: 'visible' })
      await detailMain.getByText('由应用受管 Tor 运行时提供', { exact: true }).waitFor({ state: 'visible' })
      await detailMain.getByRole('link', { name: '编辑配置' }).click()
      await page.waitForURL('**/browser/edit/*')

      const editMain = await waitForWorkspace(page)
      const preservedTorMode = editMain.getByRole('radio', { name: /Tor TCP 路由/ })
      assert(await preservedTorMode.getAttribute('aria-checked') === 'true', 'Saved Tor network mode was not preserved when reopening the fixture.')
      const preservedProxy = editMain.getByRole('combobox', { name: '代理地址选择' })
      assert(await preservedProxy.isDisabled(), 'Reopened Tor fixture unexpectedly enabled the regular proxy selector.')
      assert(await preservedProxy.inputValue() === '', `Reopened Tor fixture restored a conflicting proxy value: ${await preservedProxy.inputValue()}`)

      return {
        source: 'frontend in-memory browser profile fixture',
        fixtureName,
        selectedMode: 'tor',
        conflictingProxyCleared: conflictingProxy,
        roundtrip: 'create -> detail -> edit',
        persistedToBackend: false,
      }
    })

    await record('mock-bookmark-add-save', async () => {
      await openWorkspaceRoute(page, baseURL, '/browser/bookmarks')
      await page.getByRole('button', { name: '添加书签', exact: true }).click()
      await page.getByPlaceholder('名称，如 Google').last().fill('Latitude QA fixture')
      await page.getByPlaceholder('https://...').last().fill('https://example.invalid/latitude-qa')
      await page.getByRole('button', { name: '保存书签', exact: true }).click()
      await page.getByText(/书签已保存/).waitFor({ state: 'visible', timeout: 10_000 })
      return { fixtureName: 'Latitude QA fixture', fixtureURL: 'https://example.invalid/latitude-qa', persistedToBackend: false }
    })

    await record('settings-draft-roundtrip', async () => {
      const generalDraft = 'Latitude QA general draft'
      const torDraft = '/fixture/tor/latitude-draft'
      await settingsPage.goto(new URL('/settings', baseURL).toString(), { waitUntil: 'domcontentloaded', timeout: 20_000 })
      await waitForWorkspace(settingsPage)

      const generalInput = settingsPage.getByLabel('应用描述')
      await generalInput.waitFor({ state: 'visible', timeout: 10_000 })
      await generalInput.fill(generalDraft)
      const clickSettingsSection = async (href) => {
        await settingsPage.locator('nav[aria-label="设置分区"] a[href]').evaluateAll((nodes, targetHref) => {
          const link = nodes.find((node) => {
            if (node.getAttribute('href') !== targetHref) return false
            const style = getComputedStyle(node)
            const rect = node.getBoundingClientRect()
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
          })
          if (!(link instanceof HTMLElement)) throw new Error(`Visible settings section link not found: ${targetHref}`)
          link.click()
        }, href)
      }

      await clickSettingsSection('/settings?section=connectors')
      await settingsPage.waitForURL('**/settings?section=connectors')
      await waitForWorkspace(settingsPage)
      const mihomoRadio = settingsPage.locator('input[type="radio"][value="mihomo"]')
      await mihomoRadio.waitFor({ state: 'visible', timeout: 10_000 })
      await mihomoRadio.check()
      assert(await mihomoRadio.isChecked(), 'Settings connector draft did not select Mihomo.')
      await settingsPage.getByRole('button', { name: '刷新状态', exact: true }).click()
      await settingsPage.waitForFunction(() => document.querySelector('input[type="radio"][value="mihomo"]')?.checked === true, null, { timeout: 10_000 })
      assert(await mihomoRadio.isChecked(), 'Connector refresh discarded the unsaved radio choice.')

      await clickSettingsSection('/settings?section=tor')
      await settingsPage.waitForURL('**/settings?section=tor')
      await waitForWorkspace(settingsPage)
      const torInput = settingsPage.getByPlaceholder('/绝对路径/tor/tor')
      await torInput.waitFor({ state: 'visible', timeout: 10_000 })
      await torInput.fill(torDraft)

      await clickSettingsSection('/settings?section=connectors')
      await settingsPage.waitForURL('**/settings?section=connectors')
      await waitForWorkspace(settingsPage)
      assert(await mihomoRadio.isChecked(), 'Connector draft was lost after visiting the Tor section.')

      await clickSettingsSection('/settings')
      await settingsPage.waitForURL('**/settings')
      await waitForWorkspace(settingsPage)
      assert(await generalInput.inputValue() === generalDraft, 'General settings draft was lost after section navigation.')

      await clickSettingsSection('/settings?section=tor')
      await settingsPage.waitForURL('**/settings?section=tor')
      await waitForWorkspace(settingsPage)
      assert(await torInput.inputValue() === torDraft, 'Tor runtime path draft was lost after section navigation.')

      let leaveDialogMessage = ''
      settingsPage.once('dialog', async (dialog) => {
        leaveDialogMessage = dialog.message()
        await dialog.dismiss()
      })
      await settingsPage.locator('aside a[href="/browser/list"]:visible').first().click()
      await settingsPage.waitForTimeout(180)
      assert(leaveDialogMessage.includes('未保存'), `Leaving settings did not show the draft confirmation: ${leaveDialogMessage || '(none)'}`)
      assert(new URL(settingsPage.url()).pathname === '/settings', 'Dismissing the leave-settings dialog unexpectedly navigated away.')
      assert(await torInput.inputValue() === torDraft, 'Dismissing the leave-settings dialog lost the current Tor draft.')

      const bridgeState = await settingsPage.evaluate(() => ({ ...(window.__LATITUDE_SETTINGS_FIXTURE_STATE__ || {}) }))
      return {
        source: 'explicit mock Wails bridge; no backend calls',
        drafts: { general: generalDraft, connector: 'mihomo', tor: torDraft },
        connectorRefreshPreservedRadio: true,
        leaveSettingsDismissed: true,
        bridgeState,
      }
    }, settingsPage)

    await record('close-failure-retains-app-and-recovers-actions', async () => {
      await settingsPage.evaluate(() => window.__LATITUDE_EMIT_CLOSE_FIXTURE__())
      const dialog = settingsPage.getByRole('dialog', { name: '关闭应用确认' })
      await dialog.waitFor({ state: 'visible' })
      assert(await dialog.getByText(/有 Tor 会话时.*关闭全部受管浏览器与传输/).isVisible(), 'Close confirmation omitted the all-managed-browser cleanup policy when Tor is active.')
      const appOnly = dialog.getByRole('button', { name: '仅退出应用', exact: true })
      const all = dialog.getByRole('button', { name: '退出应用与浏览器', exact: true })
      await appOnly.click()
      await settingsPage.getByText(/可重试关闭/).waitFor({ state: 'visible' })
      assert(await appOnly.isEnabled() && await all.isEnabled(), 'Rejected app-only quit left the dialog stuck in a busy state.')
      await all.click()
      await settingsPage.getByText(/仍有浏览器或 Tor 运行时未能确认退出/).waitFor({ state: 'visible' })
      assert(await dialog.isVisible() && await appOnly.isEnabled() && await all.isEnabled(), 'Rejected full quit closed or disabled the recovery dialog.')
      const state = await settingsPage.evaluate(() => ({ ...window.__LATITUDE_SETTINGS_FIXTURE_STATE__ }))
      assert(state.forceQuitCalls === 1 && state.quitAppOnlyCalls === 1, 'The close fixture did not exercise both backend promise rejections.')
      assert(state.nativeQuitCalls === 0, 'Frontend bypassed the backend shutdown gate via runtime.Quit.')
      return { source: 'explicit mock Wails errors; no backend calls', applicationRemainedOpen: true, retryEnabled: true, nativeQuitFallbackCalls: state.nativeQuitCalls }
    }, settingsPage)
  } finally {
    await settingsContext.close()
    await context.close()
  }
  return results
}

async function runGlobeMotionFixture(browser, baseURL, outputDir) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
    serviceWorkers: 'block',
  })
  const baseOrigin = new URL(baseURL).origin
  await context.route('**/*', async (route) => {
    const requestURL = new URL(route.request().url())
    if (!['http:', 'https:'].includes(requestURL.protocol) || requestURL.origin === baseOrigin) await route.continue()
    else await route.abort('blockedbyclient')
  })
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return
    localStorage.setItem('app-theme', 'dark')
    const environment = { platform: 'darwin', arch: 'arm64' }
    window.runtime = {
      Environment: async () => environment,
      EventsOn: () => () => {},
      EventsOnMultiple: () => () => {},
      EventsOff: () => {},
      WindowMinimise: () => {},
      WindowHide: () => {},
    }
    const app = new Proxy({}, {
      get(_target, property) {
        const name = String(property)
        return async (...args) => {
          if (name === 'GetBrowserSettings') {
            return {
              userDataRoot: 'data', defaultFingerprintArgs: [], defaultLaunchArgs: [], defaultStartUrls: [],
              lightStartEnabled: true, restoreLastSession: false, startReadyTimeoutMs: 3000,
              startStableWindowMs: 1200, defaultConnectorType: 'xray',
            }
          }
          if (name === 'BrowserProxyList' || name === 'BrowserProxyListGroups') return []
          if (name === 'SaveBrowserProxies') return true
          if (name === 'BrowserProxyCoreStatus') {
            const input = args[0] || {}
            return {
              core: input.core || 'xray', goos: input.goos || 'darwin', goarch: input.goarch || 'arm64',
              installed: true, configured: true, active: true, binaryPath: '/fixture/not-used',
              source: 'verify-workspace-fixture', message: 'Verifier fixture: active component',
            }
          }
          if (name === 'GetProxyCheckSettings') {
            return { bridgeStartTimeoutMs: 15000, speedTargetId: '', ipHealthTargetId: '', targets: [] }
          }
          return null
        }
      },
    })
    window.go = { main: { App: app } }
  })

  const page = await context.newPage()
  const pageErrors = []
  const consoleErrors = []
  page.on('pageerror', (error) => pageErrors.push(error?.stack || error?.message || String(error)))
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  const startedAt = Date.now()
  try {
    const response = await page.goto(new URL('/browser/proxy-pool', baseURL).toString(), { waitUntil: 'domcontentloaded', timeout: 20_000 })
    assert(response === null || response.ok(), `Navigation returned HTTP ${response?.status()} for globe fixture.`)
    await waitForWorkspace(page)
    const globe = page.locator('figure.signal-globe').first()
    await globe.waitFor({ state: 'visible', timeout: 10_000 })
    await page.waitForFunction((element) => element?.getAttribute('data-renderer') === 'cobe', await globe.elementHandle(), { timeout: 15_000 })
    await page.waitForFunction((element) => element?.getAttribute('data-motion') === 'rotating', await globe.elementHandle(), { timeout: 10_000 })
    const activeShot = join(outputDir, 'operations', 'globe-cobe-active.png')
    await mkdir(dirname(activeShot), { recursive: true })
    await page.screenshot({ path: activeShot, animations: 'disabled' })

    const pause = page.getByRole('button', { name: '暂停地球动画' })
    await pause.focus()
    await page.keyboard.press('Enter')
    await page.waitForFunction((element) => element?.getAttribute('data-motion') === 'still', await globe.elementHandle())
    const play = page.getByRole('button', { name: '播放地球动画' })
    assert(await play.isVisible(), 'Pause control did not switch to the play action.')
    await play.focus()
    await page.keyboard.press('Space')
    await page.waitForFunction((element) => element?.getAttribute('data-motion') === 'rotating', await globe.elementHandle())

    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
    await page.waitForFunction((element) => element?.getAttribute('data-motion') === 'still', await globe.elementHandle())
    assert(await page.getByRole('button', { name: /地球动画/ }).count() === 0, 'Reduced-motion mode should hide animation controls.')
    const reducedShot = join(outputDir, 'operations', 'globe-cobe-reduced-motion.png')
    await page.screenshot({ path: reducedShot, animations: 'disabled' })
    assert(pageErrors.length === 0, `Globe fixture page errors: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Globe fixture console.error: ${consoleErrors.join(' | ')}`)
    return [{
      ok: true,
      fixture: 'globe-cobe-motion-and-pause',
      durationMs: Date.now() - startedAt,
      details: {
        source: 'explicit mock Wails bridge; no backend calls',
        normalMotion: 'cobe/rotating',
        keyboardPause: 'still',
        keyboardPlay: 'rotating',
        reducedMotion: 'cobe/still; control hidden',
      },
      screenshots: [activeShot, reducedShot],
    }]
  } catch (error) {
    const screenshot = join(outputDir, 'operations', 'globe-cobe-motion-and-pause-FAIL.png')
    await mkdir(dirname(screenshot), { recursive: true })
    await page.screenshot({ path: screenshot, animations: 'disabled' }).catch(() => {})
    return [{
      ok: false,
      fixture: 'globe-cobe-motion-and-pause',
      durationMs: Date.now() - startedAt,
      error: pageErrors.length > 0 ? `Page errors: ${pageErrors.join(' | ')}` : (error?.stack || String(error)),
      consoleErrors,
      screenshot,
    }]
  } finally {
    await context.close()
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }
  assert(['smoke', 'full'].includes(options.scope), `Unsupported scope: ${options.scope}`)
  const baseURL = normalizeBaseURL(options.baseURL)
  const runStamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  const outputDir = resolve(options.outputDir || join(repoRoot, 'output', 'playwright', `workspace-${runStamp}`))
  await mkdir(outputDir, { recursive: true })

  // Fail clearly if a dev/preview process from a prior turn has exited. Do
  // not misreport Chrome's blocked-storage error page as 114 UI regressions.
  const preflight = await fetch(baseURL, { signal: AbortSignal.timeout(5_000) })
  assert(preflight.ok, `Frontend server preflight returned HTTP ${preflight.status}. Start a local dev/preview server before verifying.`)

  const { playwright, source } = loadPlaywright()
  const routes = await loadWorkspaceRoutes()
  const allVariants = [
    { id: 'desktop-1440x960-dark', width: 1440, height: 960, theme: 'dark', colorScheme: 'dark', collapseSidebar: false },
    { id: 'desktop-1440x960-light', width: 1440, height: 960, theme: 'light', colorScheme: 'light', collapseSidebar: false },
    { id: 'compact-900x800-dark', width: 900, height: 800, theme: 'dark', colorScheme: 'dark', collapseSidebar: false },
    { id: 'compact-900x800-light', width: 900, height: 800, theme: 'light', colorScheme: 'light', collapseSidebar: false },
    { id: 'narrow-375x800-dark', width: 375, height: 800, theme: 'dark', colorScheme: 'dark', collapseSidebar: true },
    { id: 'narrow-375x800-light', width: 375, height: 800, theme: 'light', colorScheme: 'light', collapseSidebar: true },
  ].map((variant) => ({ ...variant, baseURL }))
  const variants = options.scope === 'smoke' ? [allVariants[0]] : allVariants

  console.log(`[verify-workspace] URL=${baseURL}`)
  console.log(`[verify-workspace] Playwright=${source}`)
  console.log(`[verify-workspace] Scope=${options.scope}; routes=${routes.length}; variants=${variants.length}`)
  console.log(`[verify-workspace] Artifacts=${outputDir}`)

  const chromiumExecutable = resolveChromiumExecutable()
  const launchOptions = { headless: !options.headed }
  if (chromiumExecutable) launchOptions.executablePath = chromiumExecutable
  console.log(`[verify-workspace] Chromium=${chromiumExecutable || 'Playwright managed browser'}`)
  const browser = await playwright.chromium.launch(launchOptions)
  const routeResults = []
  try {
    for (const variant of variants) {
      const context = await browser.newContext({
        viewport: { width: variant.width, height: variant.height },
        colorScheme: variant.colorScheme,
        reducedMotion: 'reduce',
        serviceWorkers: 'block',
      })
      const baseOrigin = new URL(baseURL).origin
      await context.route('**/*', async (route) => {
        const requestURL = new URL(route.request().url())
        if (!['http:', 'https:'].includes(requestURL.protocol) || requestURL.origin === baseOrigin) {
          await route.continue()
        } else {
          await route.abort('blockedbyclient')
        }
      })
      await context.addInitScript(({ theme }) => {
        if (!['http:', 'https:'].includes(location.protocol)) return
        localStorage.setItem('app-theme', theme)
        localStorage.setItem('browser:viewMode', 'table')
        localStorage.setItem('browser:headerCollapsed', 'false')
        localStorage.removeItem('browser:filters')
      }, { theme: variant.theme })
      const page = await context.newPage()

      for (const route of routes) {
        const result = await inspectRoute(page, route, variant, outputDir)
        routeResults.push(result)
        console.log(`${result.ok ? 'PASS' : 'FAIL'} ${variant.id} ${route.path}${result.ok ? '' : ` :: ${String(result.error).split('\n')[0]}`}`)
      }
      await context.close()
    }

    const operationResults = await runOperationFixtures(browser, baseURL, outputDir)
    const globeResults = await runGlobeMotionFixture(browser, baseURL, outputDir)
    operationResults.push(...globeResults)
    for (const result of operationResults) {
      console.log(`${result.ok ? 'PASS' : 'FAIL'} operation ${result.fixture}${result.ok ? '' : ` :: ${String(result.error).split('\n')[0]}`}`)
    }

    const failures = [...routeResults, ...operationResults].filter((result) => !result.ok)
    const report = {
      generatedAt: new Date().toISOString(),
      kind: 'browser-mock-frontend-regression',
      backendVerified: false,
      nativeAppVerified: false,
      fixtureProvenance: {
        browserData: 'frontend source mock fixtures; reset on full reload',
        torProfile: 'safe in-memory create/detail/edit roundtrip; no backend calls',
        globeActiveStatus: 'explicit in-page mock Wails bridge; no backend calls',
        settingsDrafts: 'explicit mock Wails bridge; section navigation and leave-confirmation roundtrip; no backend calls',
        closeFailure: 'explicit mock Wails rejected quit promises; recovery actions and absence of runtime.Quit fallback; no backend calls',
        externalNetwork: 'blocked except the provided Vite server origin',
      },
      baseURL,
      scope: options.scope,
      playwrightSource: source,
      chromiumExecutable: chromiumExecutable || 'playwright-managed',
      routes: routes.map((route) => route.path),
      variants: variants.map(({ id, width, height, theme }) => ({ id, width, height, theme, reducedMotion: 'reduce' })),
      routeResults,
      operationResults,
      summary: {
        passed: routeResults.length + operationResults.length - failures.length,
        failed: failures.length,
        total: routeResults.length + operationResults.length,
      },
    }
    const reportPath = join(outputDir, 'report.json')
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    console.log(`[verify-workspace] Report=${reportPath}`)
    console.log(`[verify-workspace] ${report.summary.passed}/${report.summary.total} checks passed`)

    if (failures.length > 0) {
      process.exitCode = 1
    }
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(`[verify-workspace] ${error?.stack || error}`)
  process.exitCode = 1
})
