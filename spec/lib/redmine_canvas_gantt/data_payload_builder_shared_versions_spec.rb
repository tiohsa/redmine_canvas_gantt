require_relative '../../spec_helper'

RSpec.describe RedmineCanvasGantt::DataPayloadBuilder do
  fixtures :projects, :users

  before do
    User.current = User.find(2)
  end

  after do
    User.current = nil
  end

  it 'matches Redmine shared_versions for every sharing mode and includes a version owned outside scope' do
    root = Project.find(1)
    child = Project.create!(name: 'Canvas shared-version child', identifier: 'canvas-shared-version-child', parent: root, is_public: true)
    sibling = Project.create!(name: 'Canvas shared-version sibling', identifier: 'canvas-shared-version-sibling', parent: root, is_public: true)
    external = Project.create!(name: 'Canvas shared-version external', identifier: 'canvas-shared-version-external', parent: nil, is_public: true)
    private_external = Project.create!(name: 'Canvas shared-version private', identifier: 'canvas-shared-version-private', parent: nil, is_public: false)

    versions = %w[none descendants hierarchy tree system].to_h do |sharing|
      version = Version.create!(project: root, name: "Canvas shared #{sharing}", sharing: sharing)
      [sharing, version]
    end
    sibling_versions = %w[none descendants hierarchy tree system].to_h do |sharing|
      version = Version.create!(project: sibling, name: "Canvas sibling #{sharing}", sharing: sharing)
      [sharing, version]
    end
    external_versions = %w[none descendants hierarchy tree system].to_h do |sharing|
      version = Version.create!(project: external, name: "Canvas separate root #{sharing}", sharing: sharing)
      [sharing, version]
    end
    hidden_system_version = Version.create!(project: private_external, name: 'Canvas shared private system', sharing: 'system')
    root.reload
    child.reload
    sibling.reload
    external.reload
    private_external.reload

    builder = described_class.new(
      custom_field_extractor: instance_double(RedmineCanvasGantt::CustomFieldExtractor),
      current_user: User.current
    )

    candidates = builder.build_versions([child.id])
    candidate_ids = candidates.map { |candidate| candidate.fetch(:id) }
    redmine_shared_version_ids = child.shared_versions.visible(User.current).pluck(:id)

    expect(candidate_ids).to match_array(redmine_shared_version_ids)
    expect(candidate_ids).to include(
      versions.fetch('descendants').id,
      versions.fetch('hierarchy').id,
      versions.fetch('tree').id,
      versions.fetch('system').id,
      sibling_versions.fetch('tree').id,
      sibling_versions.fetch('system').id,
      external_versions.fetch('system').id
    )
    expect(candidate_ids).not_to include(versions.fetch('none').id, sibling_versions.fetch('none').id,
                                         sibling_versions.fetch('descendants').id,
                                         sibling_versions.fetch('hierarchy').id, hidden_system_version.id,
                                         *external_versions.except('system').values.map(&:id))
    expect(candidates.find { |candidate| candidate[:id] == external_versions.fetch('system').id }[:project_id]).to eq(external.id)

    union_candidates = builder.build_versions([child.id, sibling.id])
    expected_union = (child.shared_versions.visible(User.current).pluck(:id) +
                      sibling.shared_versions.visible(User.current).pluck(:id)).uniq
    expect(union_candidates.map { |candidate| candidate.fetch(:id) }).to match_array(expected_union)
    expect(union_candidates.map { |candidate| candidate.fetch(:id) }).to include(
      versions.fetch('descendants').id,
      sibling_versions.fetch('descendants').id
    )

    bounded_builder = described_class.new(
      custom_field_extractor: instance_double(RedmineCanvasGantt::CustomFieldExtractor),
      current_user: User.current,
      data_payload_budget: RedmineCanvasGantt::DataPayloadBudget.new(
        environment: { 'REDMINE_CANVAS_GANTT_MAX_DATA_COLLECTION_ITEMS' => '1' }
      )
    )
    expect { bounded_builder.build_versions([child.id, sibling.id]) }
      .to raise_error(RedmineCanvasGantt::DataPayloadBudget::Exceeded) { |error|
        expect(error.resource).to eq('versions')
        expect(error.limit).to eq(1)
      }
  end
end
