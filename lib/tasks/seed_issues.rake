namespace :redmine do
  desc "Generate dummy issues"
  task generate_issues: :environment do
    project = Project.first # 最初のプロジェクトを使用
    user = User.find_by(login: 'admin')

    1000.times do |i|
      # ランダムな開始日（過去3ヶ月〜未来3ヶ月の範囲）
      start_date = Date.today + rand(-90..90).days
      # 開始日から1日〜3日後の終了日
      due_date = start_date + rand(1..3).days

      Issue.create!(
        project: project,
        tracker: project.trackers.first,
        author: user,
        subject: "Dummy issue ##{i+1}",
        description: "This is a test issue #{i+1}",
        status: IssueStatus.first,
        priority: IssuePriority.default,
        start_date: start_date,
        due_date: due_date
      )
    end
  end
end
