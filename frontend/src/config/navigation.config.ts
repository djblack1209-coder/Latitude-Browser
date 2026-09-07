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
export const navigationConfig: NavSection[] = [
  {
    title: '置顶入口',
    items: [
      {
        name: '自动配置',
        path: '/browser/auto-config',
        icon: 'Wand2',
        description: '按网络、设备与指纹快速创建实例',
      },
    ],
  },
  {
    title: '工作台',
    items: [
      { name: '实例', path: '/browser/list', icon: 'LayoutDashboard' },
      { name: '最近活动', path: '/browser/list?sort=recent', icon: 'Clock3' },
      { name: '待处理', path: '/browser/list?status=attention', icon: 'AlertTriangle' },
    ],
  },
  {
    title: '网络与代理',
    items: [
      { name: '代理池', path: '/browser/proxy-pool', icon: 'Globe' },
      { name: '连接栈', path: '/settings?section=connectors', icon: 'Network' },
      { name: 'Tor', path: '/settings?section=tor', icon: 'Shield' },
      { name: '网络诊断', path: '/browser/logs?view=network', icon: 'Radar' },
    ],
  },
  {
    title: '指纹资产',
    items: [
      { name: '指纹模板', path: '/browser/list?view=templates', icon: 'Fingerprint' },
      { name: '浏览器内核', path: '/browser/cores', icon: 'Cpu' },
      { name: '插件包', path: '/browser/extensions', icon: 'Blocks' },
      { name: '书签与标签', path: '/browser/bookmarks', icon: 'Bookmark' },
    ],
  },
  {
    title: '自动化',
    items: [
      { name: '自动化脚本', path: '/browser/automation', icon: 'Bot' },
      { name: '运行记录', path: '/browser/logs?view=runs', icon: 'ScrollText' },
    ],
  },
  {
    title: '系统',
    items: [
      { name: '设置', path: '/settings', icon: 'Settings' },
      { name: '文档中心', path: '/system/docs', icon: 'BookOpenText' },
      { name: '日志与诊断', path: '/browser/logs', icon: 'FileText' },
    ],
  },
]
