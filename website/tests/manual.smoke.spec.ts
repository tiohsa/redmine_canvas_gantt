import { expect, test } from '@playwright/test'

// Static HTML becomes visible before Vue has attached the menu handlers.
async function openPage(page: import('@playwright/test').Page, path: string) {
  await page.goto(path)
  await page.waitForFunction(() => Boolean((document.querySelector('#app') as HTMLElement & { __vue_app__?: unknown })?.__vue_app__))
}

test('Japanese and English pages load and language menu reaches the matching guide', async ({ page }) => {
  await openPage(page, './')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Redmine Canvas Gantt Manual')
  await expect(page.getByRole('button', { name: /search/i })).toBeVisible()
  const englishManual = page.locator('.manual-entry a').first()
  await expect(englishManual).toHaveText('Open the English manual')
  await englishManual.click()
  await expect(page).toHaveURL(/\/en\/$/)
  await openPage(page, './')
  await page.getByRole('link', { name: /日本語版マニュアルを開く/ }).click()
  await expect(page).toHaveURL(/\/ja\/$/)

  await openPage(page, 'ja/guide/introduction')
  await expect(page.locator('main')).toContainText(/Redmine Canvas Gantt/)
  await expect(page.locator('.manual-scope')).toContainText('v0.19.0')
  const overview = page.locator('main img[src$="canvas-gantt-overview-ja.png"]')
  await expect(overview).toBeVisible()
  await expect.poll(() => overview.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)

  await page.getByRole('button', { name: /change language/i }).click()
  await page.getByRole('link', { name: 'English' }).click()
  await expect(page).toHaveURL(/\/en\/guide\/introduction(?:\.html)?$/)
  await expect(page.locator('main')).toContainText(/Redmine Canvas Gantt/)
  await expect(page.locator('main img[src$="canvas-gantt-overview-en.png"]')).toBeVisible()

  await page.getByRole('button', { name: /change language/i }).click()
  await page.getByRole('link', { name: /日本語/ }).click()
  await expect(page).toHaveURL(/\/ja\/guide\/introduction(?:\.html)?$/)
})

test('site search finds manual content and dark mode can be toggled', async ({ page }) => {
  await openPage(page, 'en/')

  await page.getByRole('button', { name: /search/i }).click()
  const search = page.locator('#localsearch-input')
  await search.fill('installation')
  const result = page.locator('.VPLocalSearchBox .result').first()
  await expect(result).toContainText(/installation/i)
  await result.click()
  await expect(page).toHaveURL(/\/en\/guide\/installation(?:\.html)?(?:#.*)?$/)

  await openPage(page, 'ja/')
  await page.getByRole('button', { name: /検索/ }).click()
  await page.locator('#localsearch-input').fill('基本操作')
  const japaneseResult = page.locator('.VPLocalSearchBox .result').first()
  await expect(japaneseResult).toContainText(/基本操作/)
  await japaneseResult.click()
  await expect(page).toHaveURL(/\/ja\/guide\/basic-operations(?:\.html)?(?:#.*)?$/)

  const darkModeToggle = page.locator('.VPSwitchAppearance').first()
  await darkModeToggle.click()
  await expect(page.locator('html')).toHaveClass(/dark/)
})

test('manual image remains visible on a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openPage(page, 'ja/guide/introduction')

  const image = page.locator('main img').first()
  await expect(image).toBeVisible()
  const images = await page.locator('main img').all()
  expect(images.length).toBe(1)
  for (const manualImage of images) {
    await expect.poll(async () => manualImage.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true)
  }
  await page.getByRole('button', { name: 'mobile navigation' }).click()
  await expect(page.locator('#VPNavScreen')).toBeVisible()
  await expect(page.locator('#VPNavScreen').getByRole('link', { name: 'ガイド', exact: true })).toBeVisible()
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
})

const mediaPages = [
  { path: 'ja/guide/basic-operations', video: 'schedule-edit-ja.mp4', poster: 'schedule-edit-poster-ja.png' },
  { path: 'en/guide/basic-operations', video: 'schedule-edit.mp4', poster: 'schedule-edit-poster.png' },
  { path: 'ja/features/dependencies', video: 'dependency-create-ja.mp4', poster: 'dependency-create-poster-ja.png' },
  { path: 'en/features/dependencies', video: 'dependency-create.mp4', poster: 'dependency-create-poster.png' },
]

const imagePages = [
  'ja/', 'en/',
  'ja/guide/introduction', 'en/guide/introduction',
  'ja/guide/basic-operations', 'en/guide/basic-operations',
  'ja/administration/permissions', 'en/administration/permissions',
  'ja/administration/settings', 'en/administration/settings',
  'ja/features/hierarchy', 'en/features/hierarchy',
  'ja/features/baseline', 'en/features/baseline',
  'ja/features/display-export', 'en/features/display-export',
  'ja/features/filters', 'en/features/filters',
  'ja/features/work-timer', 'en/features/work-timer',
  'ja/features/workload', 'en/features/workload',
  'ja/features/dependencies', 'en/features/dependencies',
]

test('all documented screenshots load on their Japanese and English pages', async ({ page }) => {
  const loadedScreenshots = new Set<string>()
  for (const path of imagePages) {
    await openPage(page, path)
    const images = await page.locator('main img').all()
    for (const image of images) {
      await image.scrollIntoViewIfNeeded()
      await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true)
      const pathname = new URL(await image.getAttribute('src') ?? '', page.url()).pathname
      const filename = pathname.split('/').pop() ?? ''
      expect(filename).toMatch(path.startsWith('ja/') ? /-ja\.png$/ : /-en\.png$/)
      loadedScreenshots.add(filename)
    }
  }

  expect([...loadedScreenshots].sort()).toEqual([
    'baseline-compare-en.png',
    'baseline-save-en.png',
    'bulk-subtasks-en.png',
    'canvas-gantt-overview-en.png',
    'date-cell-edit-en.png',
    'display-settings-en.png',
    'export-menu-en.png',
    'issue-dialog-settings-en.png',
    'pending-save-en.png',
    'permissions-en.png',
    'relation-editor-en.png',
    'status-filter-en.png',
    'work-timer-en.png',
    'workload-en.png',
  ].flatMap(filename => [filename, filename.replace('-en.png', '-ja.png')]).sort())
})

for (const viewport of [
  { label: 'mobile', width: 390, height: 844 },
  { label: 'desktop', width: 1280, height: 900 },
]) {
  for (const entry of mediaPages) {
    test(`${entry.path} media loads and video controls fit ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await openPage(page, entry.path)

      const images = await page.locator('main img').all()
      for (const image of images) {
        await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true)
      }

      const videos = page.locator('main video')
      await expect(videos).toHaveCount(1)
      const video = videos.first()
      await expect(video).toBeVisible()
      await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.controls)).toBe(true)
      await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.preload)).toBe('metadata')
      await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.autoplay)).toBe(false)
      await expect.poll(() => video.evaluate((element: HTMLVideoElement, filename: string) => element.currentSrc.endsWith(`/videos/${filename}`), entry.video)).toBe(true)
      await expect(video).toHaveAttribute('poster', new RegExp(`/images/${entry.poster.replaceAll('.', '\\.')}$`))
      await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState >= HTMLMediaElement.HAVE_METADATA && Number.isFinite(element.duration) && element.duration > 0)).toBe(true)
      await video.scrollIntoViewIfNeeded()
      await video.click()
      const playback = await video.evaluate(async (element: HTMLVideoElement) => {
        try {
          await element.play()
          await new Promise(resolve => setTimeout(resolve, 700))
          const result = { currentTime: element.currentTime, error: element.error?.code ?? null }
          element.pause()
          return result
        } catch (error) {
          return { currentTime: 0, error: String(error) }
        }
      })
      expect(playback.error).toBeNull()
      expect(playback.currentTime).toBeGreaterThan(0)
      await expect.poll(() => video.evaluate((element: HTMLVideoElement) => {
        const poster = new Image()
        poster.src = element.poster
        return poster.complete && poster.naturalWidth > 0
      })).toBe(true)
      await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.getBoundingClientRect().width <= window.innerWidth)).toBe(true)
    })
  }
}

for (const locale of ['ja', 'en']) {
  for (const width of [390, 1280]) {
    test(`${locale} overview pages show one real screenshot at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      for (const path of [`${locale}/`, `${locale}/guide/introduction`, `${locale}/guide/basic-operations`]) {
        await openPage(page, path)
        const overview = page.locator(`main img[src$="canvas-gantt-overview-${locale}.png"]`)
        await expect(overview).toHaveCount(1)
        await overview.scrollIntoViewIfNeeded()
        await expect.poll(() => overview.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
        await expect(page.locator('main img[src$=".svg"]')).toHaveCount(0)
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
        const expand = page.locator(`main a[href$="canvas-gantt-overview-${locale}.png"]`)
        await expect(expand).toHaveCount(1)
        const response = await page.request.get((await expand.getAttribute('href'))!)
        expect(response.ok()).toBe(true)
        expect(response.headers()['content-type']).toContain('image/png')
      }
    })
  }
}
