import { tr, localized } from '../shared/i18n'
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

export const profilePageConfig: ProfilePageLocalConfig = localized(() => ({
  remoteAuthor: {
    // 留空时直接使用本地默认资料；需要远程作者页时再替换为真实地址。
    authorURL: '',
    timeoutMs: 1000,
  },
  defaultAuthor: {
    name: 'Latitude Browser Team',
    initial: 'L',
    title: tr("config.profile.config.title.f1f23af"),
    bio: tr("config.profile.config.bio.d6c9c57"),
    location: '',
    joinDate: '',
    email: '',
    website: '',
    github: PROJECT_GITHUB_URL,
    skills: ['Go', 'React', 'TypeScript', 'Wails', 'Node.js', 'Docker'],
    channels: [
      {
        name: tr("config.profile.config.name.7992533"),
        description: tr("config.profile.config.description.862e398"),
        detail: 'juejin.cn',
        href: 'https://juejin.cn/user/3790771822007822',
        icon: 'book-open',
      },
      {
        name: tr("config.profile.config.name.5cef613"),
        description: tr("config.profile.config.description.35dd28d"),
        detail: 'GitHub',
        href: PROJECT_GITHUB_URL,
        icon: 'github',
      },
      {
        name: tr("config.profile.config.name.1080c34"),
        description: tr("config.profile.config.description.6d37be9"),
        detail: 'Repository docs',
        href: `${PROJECT_GITHUB_URL}#readme`,
        icon: 'book-open',
      },
    ],
  },
  project: {
    name: projectConfig.name,
    introBadge: projectConfig.name,
    introText: tr("config.profile.config.introText.2e1dc6b"),
    techStack: ['Wails', 'React', 'TypeScript'],
    description: tr("config.profile.config.description.69fb730"),
    actions: [
      {
        label: tr("config.profile.config.label.f24e8e0"),
        href: PROJECT_GITHUB_URL,
        icon: 'github',
      },
      {
        label: tr("config.profile.config.label.042cbc2"),
        href: `${PROJECT_GITHUB_URL}/releases`,
        icon: 'globe',
      },
    ],
  },
}))

export default profilePageConfig
