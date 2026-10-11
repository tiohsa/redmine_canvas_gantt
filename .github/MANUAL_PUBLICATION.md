# Redmine Plugins Directory and manual links / Redmine Plugins Directory とマニュアル公開導線

[English](#english) | [日本語](#日本語)

## Shared directory fields / 共通項目

Use this shared listing data in either language. The Description draft below is in English so the two listings do not maintain duplicate URLs or feature text.

| Field / 項目 | Value / 設定内容 |
| --- | --- |
| Website | https://tiohsa.github.io/redmine_canvas_gantt/ |
| Code repository | https://github.com/tiohsa/redmine_canvas_gantt |
| Current version / 現在のバージョン | 0.18.0 (latest stable when checked / 確認時の最新安定版) |
| Compatibility / 互換性 | Redmine 6.0.x, 6.1.x, 7.0.x |

## English

### If a published URL changes

Check and update all of these in the same change. Maintain the site source in `website/`.

- `README.md` and `README_ja.md`
- `.github/workflows/release.yml` (Documentation links on future releases)
- `.github/pull_request_template.md`
- `.github/ISSUE_TEMPLATE/bug_report.yml` and `config.yml`
- This document
- GitHub About → Website
- Redmine Plugins Directory → Website and the Documentation links in Description

If the site's base path changes, also check `website/.vitepress/` and `.github/workflows/docs.yml`. Do not rewrite existing releases in bulk.

### Redmine Plugins Directory update

Target listing: https://www.redmine.org/plugins/redmine_canvas_gantt

**Status:** Not applied. As of 2026-10-12, the browser session was not logged in and could not access update permissions. A user with permission must apply the update.

Recheck the latest stable version immediately before updating. At the time of the check, GitHub's latest Release was `v0.18.0` (neither draft nor prerelease), matching `0.18.0` in `init.rb`. Existing CI targets Redmine 6.0.6, 6.1.2, and 7.0.0. Compatibility tests were not rerun for this update; the CI targets are evidence of the configured test matrix, not a fresh compatibility result.

### Description draft

Transfer this Markdown into the listing, adjusting its formatting to match the edit form:

```markdown
Interactive Canvas-based Gantt chart plugin for Redmine 6.0, 6.1, and 7.0.

- Interactive scheduling with drag and resize, dependency editing, and inline issue editing.
- Parent-child issue management, bulk child creation, filters and saved queries.
- Baseline comparison, workload display, PNG/CSV export, and per-issue Work Timer.
- No database migration required.

Permissions:
- view_canvas_gantt: view Canvas Gantt.
- manage_canvas_gantt_baseline: save or replace a project baseline.
- Issue actions follow Redmine's standard permissions and visibility rules: edit_issues for editing, delete_issues for deletion, and add_issues / manage_subtasks for child creation. Relations also follow related issue editability and cross_project_issue_relations.

Documentation:
- English: https://tiohsa.github.io/redmine_canvas_gantt/en/
- 日本語: https://tiohsa.github.io/redmine_canvas_gantt/ja/
```

Replace any old `edit_canvas_gantt` permission description with the permission text above, and keep the existing Code repository value. If changing installation notes, compare them with the public manual's installation instructions and update them to match. Do not imply a manual installation procedure that the published instructions do not support.

## 日本語

### 公開URLを変更する場合

次の箇所を同じ変更で確認してください。サイト原稿は `website/` で保守します。

- `README.md`、`README_ja.md`
- `.github/workflows/release.yml`（今後のReleaseに付けるDocumentation）
- `.github/pull_request_template.md`
- `.github/ISSUE_TEMPLATE/bug_report.yml`、`config.yml`
- この文書
- GitHub AboutのWebsite
- Redmine Plugins DirectoryのWebsite・Description内のDocumentation

サイトのベースパスを変更する場合は、`website/.vitepress/` と `.github/workflows/docs.yml` も確認します。既存Releaseの一括書き換えは行いません。

### Redmine Plugins Directory更新

対象: https://www.redmine.org/plugins/redmine_canvas_gantt

**状態:** 未適用。2026-10-12の確認時、ブラウザは未ログインで更新権限を利用できませんでした。権限を持つユーザーが更新してください。

最新安定版は更新直前に再確認してください。確認時はGitHubのlatest Releaseが `v0.18.0`（draft・prereleaseともfalse）で、`init.rb` の `0.18.0` と一致しました。既存CIの対象は6.0.6、6.1.2、7.0.0です。今回互換性テストは再実行していません。CIの対象バージョンは設定済みテストマトリクスを示すもので、今回あらためて互換性を確認した結果ではありません。

### Description用文案

共通項目の表と上記 English Description draft を使ってください。編集画面の書式に合わせて転記します。

上記の権限説明を使い、古い `edit_canvas_gantt` の説明を置き換えてください。既存のCode repositoryは維持します。Installation notesも変更する場合は、公開マニュアルのインストール手順と照合し、内容を一致させてください。公開マニュアルで確認できない導入手順を案内しないでください。
