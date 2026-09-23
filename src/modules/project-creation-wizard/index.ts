// The deferred wrapper, not the wizard: see LazyProjectCreationWizard for why.
export { LazyProjectCreationWizard as ProjectCreationWizard } from '@/modules/project-creation-wizard/LazyProjectCreationWizard';
export { getSuggestionRootPath } from '@/modules/project-creation-wizard/utils/pathUtils';
export {
  browseFilesystemFolders,
  createProjectRequest,
} from '@/modules/project-creation-wizard/utils/workspaceApi';
