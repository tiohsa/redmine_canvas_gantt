import { defineConfig } from 'vitepress'

const repository = 'https://github.com/tiohsa/redmine_canvas_gantt'

const jaSidebar = [
  {
    text: 'ガイド',
    items: [
      { text: 'はじめに', link: '/ja/guide/introduction' },
      { text: 'インストール', link: '/ja/guide/installation' },
      { text: '基本操作', link: '/ja/guide/basic-operations' },
    ],
  },
  {
    text: '機能',
    items: [
      { text: '階層', link: '/ja/features/hierarchy' },
      { text: '依存関係', link: '/ja/features/dependencies' },
      { text: 'フィルター', link: '/ja/features/filters' },
      { text: 'ベースライン', link: '/ja/features/baseline' },
      { text: 'ワークロード', link: '/ja/features/workload' },
      { text: '作業時間タイマー', link: '/ja/features/work-timer' },
      { text: '表示・エクスポート', link: '/ja/features/display-export' },
      { text: 'クエリパラメーター', link: '/ja/features/query-parameters' },
    ],
  },
  {
    text: '管理者ガイド',
    items: [
      { text: '設定', link: '/ja/administration/settings' },
      { text: '権限', link: '/ja/administration/permissions' },
      { text: 'カレンダー', link: '/ja/administration/calendars' },
      { text: 'デプロイ', link: '/ja/administration/deployment' },
    ],
  },
  { text: 'トラブルシューティング', link: '/ja/troubleshooting/' },
]

const enSidebar = [
  {
    text: 'Guides',
    items: [
      { text: 'Introduction', link: '/en/guide/introduction' },
      { text: 'Installation', link: '/en/guide/installation' },
      { text: 'Basic operations', link: '/en/guide/basic-operations' },
    ],
  },
  {
    text: 'Features',
    items: [
      { text: 'Hierarchy', link: '/en/features/hierarchy' },
      { text: 'Dependencies', link: '/en/features/dependencies' },
      { text: 'Filters', link: '/en/features/filters' },
      { text: 'Baselines', link: '/en/features/baseline' },
      { text: 'Workload', link: '/en/features/workload' },
      { text: 'Work timer', link: '/en/features/work-timer' },
      { text: 'Display and export', link: '/en/features/display-export' },
      { text: 'Query parameters', link: '/en/features/query-parameters' },
    ],
  },
  {
    text: 'Administration',
    items: [
      { text: 'Settings', link: '/en/administration/settings' },
      { text: 'Permissions', link: '/en/administration/permissions' },
      { text: 'Calendars', link: '/en/administration/calendars' },
      { text: 'Deployment', link: '/en/administration/deployment' },
    ],
  },
  { text: 'Troubleshooting', link: '/en/troubleshooting/' },
]

const jaSearch = {
  provider: 'local' as const,
  options: {
    locales: {
      ja: {
        translations: {
          button: { buttonText: '検索', buttonAriaLabel: '検索' },
          modal: {
            noResultsText: '結果が見つかりません',
            resetButtonTitle: '検索をリセット',
            footer: {
              selectText: '選択',
              navigateText: '移動',
              closeText: '閉じる',
            },
          },
        },
      },
      root: {
        translations: {
          button: { buttonText: '検索', buttonAriaLabel: '検索' },
          modal: {
            noResultsText: '結果が見つかりません',
            resetButtonTitle: '検索をリセット',
            footer: {
              selectText: '選択',
              navigateText: '移動',
              closeText: '閉じる',
            },
          },
        },
      },
    },
  },
}

const enSearch = { provider: 'local' as const }

export default defineConfig({
  lang: 'ja-JP',
  title: 'Redmine Canvas Gantt Manual',
  description: 'User manual for Redmine Canvas Gantt',
  base: '/redmine_canvas_gantt/',
  cleanUrls: true,
  lastUpdated: true,
  srcExclude: ['MAINTENANCE.md', 'IMPLEMENTATION_REPORT.md'],
  head: [['meta', { name: 'theme-color', content: '#ffffff' }]],
  themeConfig: {
    nav: [
      { text: '日本語', link: '/ja/' },
      { text: 'English', link: '/en/' },
    ],
    socialLinks: [{ icon: 'github', link: repository }],
    search: jaSearch,
    editLink: {
      pattern: `${repository}/edit/main/website/:path`,
      text: 'このページを編集',
    },
    footer: {
      message: '対象バージョン: v0.18.0（2026-10-11確認）',
      copyright: 'Redmine Canvas Gantt contributors',
    },
  },
  locales: {
    ja: {
      label: '日本語',
      lang: 'ja-JP',
      title: 'Redmine Canvas Gantt マニュアル',
      description: 'Redmine Canvas Gantt の利用者向けマニュアル',
      themeConfig: {
        outline: { label: 'このページの内容' },
        docFooter: { prev: '前のページ', next: '次のページ' },
        sidebarMenuLabel: 'メニュー',
        returnToTopLabel: 'ページの先頭へ',
        darkModeSwitchLabel: '表示モード',
        darkModeSwitchTitle: 'ダークモードに切り替える',
        lightModeSwitchTitle: 'ライトモードに切り替える',
        nav: [
          { text: 'ホーム', link: '/ja/' },
          { text: 'ガイド', link: '/ja/guide/introduction' },
          { text: '機能', link: '/ja/features/hierarchy' },
          { text: '管理者ガイド', link: '/ja/administration/settings' },
        ],
        sidebar: { '/ja/': jaSidebar },
        search: jaSearch,
        editLink: {
          pattern: `${repository}/edit/main/website/:path`,
          text: 'このページを編集',
        },
        footer: {
          message: '対象バージョン: v0.18.0（2026-10-11確認）',
          copyright: 'Redmine Canvas Gantt contributors',
        },
      },
    },
    en: {
      label: 'English',
      lang: 'en-US',
      title: 'Redmine Canvas Gantt Manual',
      description: 'User manual for Redmine Canvas Gantt',
      themeConfig: {
        nav: [
          { text: 'Home', link: '/en/' },
          { text: 'Guides', link: '/en/guide/introduction' },
          { text: 'Features', link: '/en/features/hierarchy' },
          { text: 'Administration', link: '/en/administration/settings' },
        ],
        sidebar: { '/en/': enSidebar },
        search: enSearch,
        editLink: {
          pattern: `${repository}/edit/main/website/:path`,
          text: 'Edit this page',
        },
        footer: {
          message: 'Manual version: v0.18.0 (verified 2026-10-11)',
          copyright: 'Redmine Canvas Gantt contributors',
        },
      },
    },
  },
})
