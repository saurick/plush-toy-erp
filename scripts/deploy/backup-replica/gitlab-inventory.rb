require 'json'
require 'digest'
project = Project.find(1)
raise 'project identity mismatch' unless project.full_path == 'saurick/plush-toy-erp'
counts = {
  users: User.count, projects: Project.count, releases: Release.count,
  packages: Packages::Package.count, packageFiles: Packages::PackageFile.count,
  pipelines: Ci::Pipeline.count, jobs: Ci::Build.count, artifacts: Ci::JobArtifact.count,
  environments: Environment.count, deployments: Deployment.count
}
packages = Packages::Package.where(project_id:1, name: 'plush-deployment-evidence').order(:id).to_a + Packages::Package.where(project_id:1, name: 'plush-release').order(id: :desc).limit(1).to_a
files = packages.flat_map do |pkg|
  pkg.package_files.order(:id).map do |record|
    path = record.file.path
    raise "package file missing #{record.id}" unless File.file?(path)
    actual = Digest::SHA256.file(path).hexdigest
    raise "package digest mismatch #{record.id}" unless actual == record.file_sha256 && File.size(path) == record.size
    {id:record.id,packageId:pkg.id,name:record.file_name,size:record.size,sha256:actual}
  end
end
artifacts = Ci::JobArtifact.where(file_type:1).order(id: :desc).limit(3).map do |r|
  raise "artifact missing #{r.id}" unless File.file?(r.file.path) && File.size(r.file.path) == r.size
  {id:r.id,jobId:r.job_id,size:r.size,sha256:Digest::SHA256.file(r.file.path).hexdigest}
end
deployments = Deployment.order(:id).pluck(:id,:project_id,:environment_id,:iid,:sha,:ref,:status,:created_at)
repositories = Project.order(:id).map do |p|
  # GitLab resolves repositories through Gitaly; its internal state directories
  # also end in .git but are not repositories. Native fsck raises on corruption.
  p.repository.fsck
  refs = (p.repository.branch_names + p.repository.tag_names).sort.map { |name| [name, p.repository.commit(name)&.id] }
  {id:p.id, path:p.full_path, refs:refs}
end
puts JSON.pretty_generate({repositories:repositories,version:Gitlab::VERSION,main:project.repository.commit('main').id,counts:counts,packageFiles:files,artifactSamples:artifacts,deployments:deployments,unfinishedBackgroundMigrations:ApplicationRecord.connection.select_value('SELECT count(*) FROM batched_background_migrations WHERE status NOT IN (3,6)').to_i})
