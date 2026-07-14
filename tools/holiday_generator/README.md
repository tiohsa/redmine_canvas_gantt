# Holiday calendar generator

This standalone Ruby bundle generates business-calendar YAML from the `holidays` gem. It is intentionally separate from Redmine's production bundle and does not use an external API.

```bash
bundle install
bundle exec ruby generate.rb \
  --region jp \
  --calendar-id JP \
  --name Japan \
  --from 2026 \
  --to 2030 \
  --output /path/to/business_calendars/generated/JP.yml
```

Use `--region us --calendar-id US --name "United States"` for a United States calendar.

The generator creates new files by default. An existing file can be replaced only when it contains `calendar.managed: true` and `--force` is supplied. Files with `managed: false` or no `managed` field are never overwritten by `--force`. Replacement uses a temporary file in the output directory followed by an atomic rename.

Keep company holidays and substitute working days in a separate file under `custom/` that uses the generated calendar as `calendar.base`. This prevents regeneration from discarding company-specific changes.
