# Run with rails runner ONLY in a disposable Redmine dedicated to documentation.
# Load English default data first. The password is supplied out of band.
abort 'Set MANUAL_CAPTURE_DISPOSABLE=1 for the dedicated capture database' unless ENV['MANUAL_CAPTURE_DISPOSABLE'] == '1'
password = ENV.fetch('MANUAL_CAPTURE_PASSWORD')
Setting.default_language = 'en'
Setting.app_title = 'Manual Demo Redmine'
user = User.find_or_initialize_by(login: 'manual-demo')
user.assign_attributes(firstname: 'Alex', lastname: 'Demo', mail: 'manual-demo@example.test', language: 'en', admin: true, status: User::STATUS_ACTIVE, password: password, password_confirmation: password)
user.save!
role = Role.find_or_initialize_by(name: 'Manual Editor')
role.permissions = [:view_issues, :view_canvas_gantt, :edit_issues, :add_issues, :manage_subtasks, :log_time, :view_time_entries, :manage_canvas_gantt_baseline]
role.save!
project = Project.find_or_initialize_by(identifier: 'manual-demo')
project.assign_attributes(name: 'Website Launch (Demo)', is_public: false, enabled_module_names: ['issue_tracking', 'canvas_gantt', 'time_tracking'])
project.save!
project.trackers = Tracker.all
member = Member.find_or_initialize_by(project: project, principal: user)
member.roles = [role]
member.save!
version = project.versions.find_or_create_by!(name: 'Initial Launch') { |v| v.effective_date = Date.new(2026, 10, 30) }
rows = [
 ['Planning and Design', '2026-10-12', '2026-10-16', 0, nil],
 ['Gather requirements', '2026-10-12', '2026-10-13', 100, 0],
 ['Design page layout', '2026-10-14', '2026-10-16', 60, 0],
 ['Build and Launch', '2026-10-19', '2026-10-30', 0, nil],
 ['Implement pages', '2026-10-19', '2026-10-22', 30, 3],
 ['Review the design', '2026-10-23', '2026-10-26', 0, 3],
 ['Verify functionality', '2026-10-27', '2026-10-28', 0, 3],
 ['Prepare launch', '2026-10-29', '2026-10-30', 0, 3]
]
issues = []
rows.each do |subject, first, last, progress, parent|
 issue = project.issues.find_or_initialize_by(subject: subject)
 # Reruns retain schedule edits and recordings; use a fresh disposable DB for a clean take.
 if issue.new_record?
  issue.assign_attributes(tracker: Tracker.first, author: user, assigned_to: user, priority: IssuePriority.default || IssuePriority.first, status: IssueStatus.where(is_closed: progress == 100).first, start_date: Date.iso8601(first), due_date: Date.iso8601(last), done_ratio: progress, estimated_hours: 8, fixed_version: version, parent_issue_id: parent ? issues.fetch(parent).id : nil)
  issue.save!
 end
 issues << issue
end
[[1,2],[2,4],[4,5],[5,6],[6,7]].each do |from,to|
 IssueRelation.find_or_create_by!(issue_from: issues.fetch(from), issue_to: issues.fetch(to), relation_type: 'precedes') { |r| r.delay = 0 }
end
if project.time_entries.empty?
 TimeEntry.create!(project: project, issue: issues.fetch(4), user: user, author: user, spent_on: Date.new(2026,10,19), hours: 3, activity: TimeEntryActivity.first, comments: 'Sample implementation work')
end
puts 'Manual demo ready (fictional data only).'
