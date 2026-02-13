require 'spec_helper'

describe CanvasGanttsController do
  describe 'PATCH #update category' do
    it 'returns forbidden when category_id is not safe attribute' do
      skip 'Requires Redmine controller test harness with authenticated project context'
    end

    it 'returns conflict on stale lock_version' do
      skip 'Requires fixture-backed Issue update with optimistic lock setup'
    end
  end
end
