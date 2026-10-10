require 'tmpdir'
require 'open3'
require 'rbconfig'
require_relative '../../spec_helper'
require_relative '../../../tools/holiday_generator/import_cabinet_office'

RSpec.describe CabinetOfficeHolidayImporter do
  around do |example|
    Dir.mktmpdir('cabinet-office-import') do |directory|
      @directory = directory
      @input = File.join(directory, 'syukujitsu.csv')
      @output = File.join(directory, 'JP.yml')
      example.run
    end
  end

  def importer(input: @input, output: @output, force: false, calendar_id: 'JP', name: 'Japan')
    described_class.new(input: input, output: output, calendar_id: calendar_id, name: name, force: force)
  end

  def input_bytes(bytes)
    File.binwrite(@input, bytes)
  end

  def existing_output(managed: true, value: 'previous')
    managed_line = managed == :missing ? '' : "  managed: #{managed}\n"
    File.write(@output, "schema_version: 1\ncalendar:\n  id: JP\n  name: Japan\n#{managed_line}marker: #{value}\n")
  end

  it 'normalizes dates, ignores binary Japanese bytes, and sorts deterministically' do
    input_bytes("date,name\r\n2028/2/29,\x93\xfa\x96\x7b\x8c\xea\r\n\r\n2027/1/1,New Year")

    importer.run
    first_output = File.binread(@output)
    payload = YAML.safe_load(first_output)

    expect(payload.fetch('days').map { |day| day.fetch('date') }).to eq(%w[2027-01-01 2028-02-29])
    expect(payload.fetch('days').map { |day| day.fetch('name') }.uniq).to eq(['Japanese public holiday'])
    expect(payload.fetch('days').map { |day| day.fetch('type') }.uniq).to eq(['non_working'])
    FileUtils.rm_f(@output)
    importer.run
    expect(File.binread(@output)).to eq(first_output)
  end

  it 'rejects duplicate dates' do
    input_bytes("date,name\n2027/1/1,one\n2027/01/01,two\n")
    expect { importer.run }.to raise_error(ArgumentError, /duplicate date/)
  end

  it 'rejects impossible dates and malformed rows' do
    input_bytes("date,name\n2027/2/29,invalid\n")
    expect { importer.run }.to raise_error(ArgumentError, /invalid date/)

    input_bytes("date,name\nnot a row\n")
    expect { importer.run }.to raise_error(ArgumentError, /comma/)

    input_bytes("date,name\n2027/13/1,invalid\n")
    expect { importer.run }.to raise_error(ArgumentError, /invalid date/)
  end

  it 'rejects header-only and empty valid datasets' do
    input_bytes("date,name\n")
    expect { importer.run }.to raise_error(ArgumentError, /no holiday dates/)

    input_bytes('')
    expect { importer.run }.to raise_error(ArgumentError, /header/)
  end

  it 'rejects duplicate CSV rows and over-limit input without changing output' do
    existing_output
    before = File.binread(@output)
    input_bytes("date,name\n#{("2027/1/1,x\n" * 2)}")
    expect { importer(force: true).run }.to raise_error(ArgumentError, /duplicate date/)
    expect(File.binread(@output)).to eq(before)

    input_bytes("x" * (CabinetOfficeHolidayImporter::MAX_FILE_SIZE + 1))
    expect { importer(force: true).run }.to raise_error(ArgumentError, /input exceeds/)
    expect(File.binread(@output)).to eq(before)
  end

  it 'rejects more than 10,000 days' do
    rows = (Date.new(1900, 1, 1)..Date.new(2027, 5, 18)).take(10_001).map { |date| "#{date.year}/#{date.month}/#{date.day},x\n" }.join
    input_bytes("date,name\n" + rows)
    expect { importer.run }.to raise_error(ArgumentError, /10000/)
  end

  it 'regenerates the complete snapshot and preserves existing bytes on invalid input' do
    input_bytes("date,name\n2027/1/1,x\n2027/1/2,x\n")
    existing_output
    importer(force: true).run
    expect(YAML.safe_load(File.binread(@output)).fetch('days').length).to eq(2)

    input_bytes("date,name\n2027/1/1,x\n")
    importer(force: true).run
    payload = YAML.safe_load(File.binread(@output))
    expect(payload.fetch('days').map { |day| day.fetch('date') }).to eq(['2027-01-01'])

    before = File.binread(@output)
    input_bytes("date,name\n2027/2/30,bad\n")
    expect { importer(force: true).run }.to raise_error(ArgumentError, /invalid date/)
    expect(File.binread(@output)).to eq(before)
  end

  it 'rejects an oversized generated YAML before replacing the existing file' do
    input_bytes("date,name\n2027/1/1,x\n")
    existing_output
    before = File.binread(@output)
    oversized_days = Array.new(6_000) do |index|
      { 'date' => "2027-01-#{(index % 28) + 1}", 'name' => 'H' * 255, 'type' => 'non_working' }
    end
    subject = importer(force: true)
    allow(subject).to receive(:parse_days).and_return(oversized_days)
    expect { subject.run }.to raise_error(ArgumentError, /generated calendar exceeds 1048576 bytes/)
    expect(File.binread(@output)).to eq(before)
  end

  it 'cleans up its temporary file and preserves output when atomic rename fails' do
    input_bytes("date,name\n2027/1/1,x\n")
    existing_output
    before = File.binread(@output)
    tempfiles_before = Dir.glob(File.join(@directory, 'cabinet-office-calendar-*'))
    allow(File).to receive(:rename).and_raise(Errno::EIO)

    expect { importer(force: true).run }.to raise_error(Errno::EIO)
    expect(File.binread(@output)).to eq(before)
    expect(Dir.glob(File.join(@directory, 'cabinet-office-calendar-*'))).to eq(tempfiles_before)
  end

  it 'rejects oversized and whitespace-only names' do
    input_bytes("date,name\n2027/1/1,x\n")
    expect { importer(name: ' ' * 10).run }.to raise_error(ArgumentError, /name/)
    expect { importer(name: 'J' * 256).run }.to raise_error(ArgumentError, /name/)
  end

  it 'runs from the command line' do
    input_bytes("date,name\n2027/1/1,x\n")
    script = File.expand_path('../../../tools/holiday_generator/import_cabinet_office.rb', __dir__)
    stdout, stderr, status = Open3.capture3(
      RbConfig.ruby, script,
      '--input', @input,
      '--calendar-id', 'JP',
      '--name', 'Japan',
      '--output', @output
    )
    expect(status).to be_success, stderr
    expect(stdout).to include('Imported 1 holidays')
    expect(YAML.safe_load(File.binread(@output)).dig('calendar', 'id')).to eq('JP')
  end

  it 'requires force and managed true to replace existing output' do
    input_bytes("date,name\n2027/1/1,x\n")
    existing_output
    expect { importer.run }.to raise_error(ArgumentError, /already exists/)
    expect { importer(force: true).run }.not_to raise_error

    existing_output(managed: false)
    expect { importer(force: true).run }.to raise_error(ArgumentError, /unmanaged/)
    existing_output(managed: 'missing')
    expect { importer(force: true).run }.to raise_error(ArgumentError, /unmanaged/)

    existing_output(managed: :missing)
    expect { importer(force: true).run }.to raise_error(ArgumentError, /unmanaged/)
  end

  it 'rejects input and output resolving to the same path' do
    input_bytes("date,name\n2027/1/1,x\n")
    expect { importer(output: @input).run }.to raise_error(ArgumentError, /same path/)

    linked = File.join(@directory, 'input-link.csv')
    File.link(@input, linked)
    expect { importer(output: linked).run }.to raise_error(ArgumentError, /same path/)
  end

  it 'loads through BusinessCalendarLoader and permits a company working override' do
    require_relative '../../../lib/redmine_canvas_gantt/business_calendar_loader'
    input_bytes("date,name\n2027/1/1,x\n")
    importer.run
    custom_dir = File.join(@directory, 'custom')
    Dir.mkdir(custom_dir)
    File.write(File.join(custom_dir, 'company.yml'), <<~YAML)
      schema_version: 1
      calendar:
        id: company-japan
        name: Company Japan
        base: JP
      days:
        - date: "2027-01-01"
          name: Company working day
          type: working
    YAML
    custom_path = File.join(custom_dir, 'company.yml')
    custom_bytes = File.binread(custom_path)
    importer(force: true).run

    loader = RedmineCanvasGantt::BusinessCalendarLoader.new(
      directory: @directory,
      fallback_non_working_week_days: [6, 7]
    )
    snapshot = loader.load
    calendar = snapshot.calendars.fetch('company-japan')
    expect(snapshot.calendars.fetch('JP').day_info(Date.new(2027, 1, 1))).to include(type: 'non_working', source: 'override')
    expect(calendar.day_info(Date.new(2027, 1, 1))).to include(type: 'working', source: 'override')
    expect(File.binread(custom_path)).to eq(custom_bytes)
  end
end
