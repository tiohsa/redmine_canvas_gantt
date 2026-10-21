import DefaultTheme from 'vitepress/theme'
import { defineComponent, h } from 'vue'
import { useData, withBase } from 'vitepress'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout: defineComponent({
    setup() {
      const { lang, page } = useData()

      const scope = () => h(
              'div',
              { class: 'manual-scope', role: 'note' },
              lang.value.startsWith('ja')
                ? [
                    '対象バージョン: v0.19.0。',
                    ' ',
                    h(
                      'a',
                      { href: 'https://github.com/tiohsa/redmine_canvas_gantt/releases/tag/v0.19.0' },
                      '対象リリース',
                    ),
                    ...(page.value.isNotFound
                      ? [
                          '。ページが見つかりません。',
                          ' ',
                          h('a', { href: withBase('/ja/') }, '日本語版トップへ'),
                        ]
                      : []),
                  ]
                : [
                    'Manual version: v0.19.0.',
                    ' ',
                    h(
                      'a',
                      { href: 'https://github.com/tiohsa/redmine_canvas_gantt/releases/tag/v0.19.0' },
                      'Release notes',
                    ),
                    ...(page.value.isNotFound
                      ? [
                          ' The requested page was not found.',
                          ' ',
                          h('a', { href: withBase('/ja/') }, 'Open the Japanese manual'),
                        ]
                      : []),
                  ],
            )

      return () => h(DefaultTheme.Layout, null, {
        'doc-before': scope,
        'layout-bottom': () => page.value.isNotFound ? scope() : null,
      })
    },
  }),
}
