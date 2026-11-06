import { tr, localized } from '../shared/i18n'
export interface NavItem {
  name: string
  path: string
  icon: string
  description?: string
}

export interface NavSection {
  title: string
  items: NavItem[]
}

/**
 * Latitude 的信息架构优先服务两个场景：
 * 1. 新手从“自动配置”进入，尽量少碰复杂参数。
 * 2. 熟悉指纹浏览器的用户可以在资产、网络和自动化模块中继续深挖。
 *
 * query 参数驱动真实的筛选、排序和分区；复用页面实现，但不再只是预留入口。
 */
export const navigationConfig: NavSection[] = localized(() => ([
  {
    title: tr("config.navigation.config.title.2b5216a"),
    items: [
      {
        name: tr("config.navigation.config.name.716e01f"),
        path: '/browser/auto-config',
        icon: 'Wand2',
        description: tr("config.navigation.config.description.c644120"),
      },
    ],
  },
  {
    title: tr("config.navigation.config.title.8483cd2"),
    items: [
      { name: tr("config.navigation.config.name.69fffaf"), path: '/browser/list', icon: 'LayoutDashboard' },
      { name: tr("config.navigation.config.name.8764fbc"), path: '/browser/list?sort=recent', icon: 'Clock3' },
      { name: tr("config.navigation.config.name.59a9eb4"), path: '/browser/list?status=attention', icon: 'AlertTriangle' },
    ],
  },
  {
    title: tr("config.navigation.config.title.c082ff0"),
    items: [
      { name: tr("config.navigation.config.name.9830ee8"), path: '/browser/proxy-pool', icon: 'Globe' },
      { name: tr("config.navigation.config.name.624647e"), path: '/settings?section=connectors', icon: 'Network' },
      { name: 'Tor', path: '/settings?section=tor', icon: 'Shield' },
      { name: tr("config.navigation.config.name.afddb5c"), path: '/browser/logs?view=network', icon: 'Radar' },
    ],
  },
  {
    title: tr("config.navigation.config.title.6f67c26"),
    items: [
      { name: tr("config.navigation.config.name.eab679e"), path: '/browser/list?view=templates', icon: 'Fingerprint' },
      { name: tr("config.navigation.config.name.a709cd9"), path: '/browser/cores', icon: 'Cpu' },
      { name: tr("config.navigation.config.name.09440f1"), path: '/browser/extensions', icon: 'Blocks' },
      { name: tr("config.navigation.config.name.9d1d2a1"), path: '/browser/bookmarks', icon: 'Bookmark' },
    ],
  },
  {
    title: tr("config.navigation.config.title.90e4e9b"),
    items: [
      { name: tr("config.navigation.config.name.b9a14be"), path: '/browser/automation', icon: 'Bot' },
      { name: tr("config.navigation.config.name.24fb424"), path: '/browser/logs?view=runs', icon: 'ScrollText' },
    ],
  },
  {
    title: tr("config.navigation.config.title.1a1f6df"),
    items: [
      { name: tr("config.navigation.config.name.7debf9c"), path: '/settings', icon: 'Settings' },
      { name: tr("config.navigation.config.name.4bdf236"), path: '/system/docs', icon: 'BookOpenText' },
      { name: tr("config.navigation.config.name.53a41da"), path: '/browser/logs', icon: 'FileText' },
    ],
  },
]))
