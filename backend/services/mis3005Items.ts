// Re-exports the shared MCS 3005 item definitions for use within the services layer.
// Routes import from ../checklist/mis3005Items; services import from here.

export type { ProjectType, ItemStatus, ChecklistItemTemplate } from '../checklist/mis3005Items';
export { mis3005Items as MIS_3005_ITEMS } from '../checklist/mis3005Items';

import { mis3005Items, ProjectType, ChecklistItemTemplate } from '../checklist/mis3005Items';

export function getItemsForProjectType(projectType: ProjectType): ChecklistItemTemplate[] {
  return mis3005Items.filter(
    item => !item.appliesToTypes || item.appliesToTypes.includes(projectType)
  );
}
