import { projectConfig } from './projectBase.config'
import { PROJECT_GITHUB_URL } from './links'

export type ProfileIconKey =
  | 'book-open'
  | 'globe'
  | 'message-square'
  | 'github'
  | 'mail'
  | 'external-link'

export interface ProfileChannelConfig {
  name: string
  description: string
  detail: string
  href?: string
  icon?: ProfileIconKey
}

export interface AuthorProfileConfig {
  name: string
  initial: string
  title: string
  bio: string
  location: string
  joinDate: string
  email: string
  website: string
  github: string
  skills: string[]
  channels: ProfileChannelConfig[]
}

export interface ProjectProfileActionConfig {
  label: string
  href: string
  icon: ProfileIconKey
}

export interface ProjectProfileConfig {
  name: string
  introBadge: string
  introText: string
  techStack: string[]
  description: string
  actions: ProjectProfileActionConfig[]
}

export interface RemoteAuthorSourceConfig {
  authorURL: string
  timeoutMs: number
}

export interface ProfilePageLocalConfig {
  remoteAuthor: RemoteAuthorSourceConfig
  defaultAuthor: AuthorProfileConfig
  project: ProjectProfileConfig
}

export const profilePageConfig: ProfilePageLocalConfig = {
  remoteAuthor: {
    // 留空时直接使用本地默认资料；需要远程作者页时再替换为真实地址。
    authorURL: '',
    timeoutMs: 1000,
  },
  defaultAuthor: {
    name: 'Latitude Browser Team',
    initial: 'L',
    title: '产品维护团队',
    bio: '专注于多账号隔离、代理连接和本地浏览器环境管理。',
    location: '',
    joinDate: '',
    email: '',
    website: '',
    github: PROJECT_GITHUB_URL,
    skills: ['Go', 'React', 'TypeScript', 'Wails', 'Node.js', 'Docker'],
    channels: [
      {
        name: '掘金',
        description: '技术文章与开发记录',
        detail: 'juejin.cn',
        href: 'https://juejin.cn/user/3790771822007822',
        icon: 'book-open',
      },
      {
        name: '项目仓库',
        description: '源码、发行版与问题追踪',
        detail: 'GitHub',
        href: PROJECT_GITHUB_URL,
        icon: 'github',
      },
      {
        name: '开发文档',
        description: '工作流与连接栈说明',
        detail: 'Repository docs',
        href: `${PROJECT_GITHUB_URL}#readme`,
        icon: 'book-open',
      },
    ],
  },
  project: {
    name: projectConfig.name,
    introBadge: projectConfig.name,
    introText: '是一个面向多账号隔离、代理绑定和本地环境管理的桌面浏览器工具。',
    techStack: ['Wails', 'React', 'TypeScript'],
    description: '项目当前聚焦浏览器实例隔离、代理池配置、浏览器内核管理、标签检索和快捷启动等核心能力，适合跨境电商、社媒运营、本地测试以及需要统一管理浏览器环境的团队场景。',
    actions: [
      {
        label: '查看源码',
        href: PROJECT_GITHUB_URL,
        icon: 'github',
      },
      {
        label: '下载发布版',
        href: `${PROJECT_GITHUB_URL}/releases`,
        icon: 'globe',
      },
    ],
  },
}

export default profilePageConfig
