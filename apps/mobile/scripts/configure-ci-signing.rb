require 'pathname'
require 'xcodeproj'

mobile_root = Pathname.new(__dir__).parent
project_path = Pathname.new(
  ENV.fetch('AFILMORY_XCODE_PROJECT_PATH', mobile_root.join('Afilmory.xcodeproj').to_s),
)
team_id = ENV.fetch('APPLE_TEAM_ID')

profiles = {
  'Afilmory' => ENV.fetch('IOS_APP_PROFILE_NAME'),
  'AfilmoryShare' => ENV.fetch('IOS_SHARE_PROFILE_NAME'),
  'AfilmoryWidgets' => ENV.fetch('IOS_WIDGETS_PROFILE_NAME'),
}

project = Xcodeproj::Project.open(project_path)
target_attributes = project.root_object.attributes['TargetAttributes'] ||= {}

profiles.each do |target_name, profile_name|
  target = project.targets.find { |candidate| candidate.name == target_name }
  raise "#{target_name} target is missing" unless target

  release_configuration = target.build_configurations.find { |configuration| configuration.name == 'Release' }
  raise "#{target_name} Release configuration is missing" unless release_configuration

  release_configuration.build_settings.merge!(
    'CODE_SIGN_IDENTITY[sdk=iphoneos*]' => 'Apple Distribution',
    'CODE_SIGN_STYLE' => 'Manual',
    'DEVELOPMENT_TEAM' => team_id,
    'PROVISIONING_PROFILE_SPECIFIER[sdk=iphoneos*]' => profile_name,
  )

  attributes = target_attributes[target.uuid] ||= {}
  attributes['DevelopmentTeam'] = team_id
  attributes['ProvisioningStyle'] = 'Manual'

  puts "Configured #{target_name} Release with profile #{profile_name}."
end

project.save
