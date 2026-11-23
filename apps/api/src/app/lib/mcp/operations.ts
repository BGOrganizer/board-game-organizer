import { catalogOperations } from "./operations-catalog";
import { groupsOperations } from "./operations-groups";
import { recordsOperations } from "./operations-records";
import { socialOperations } from "./operations-social";

export const operations = [
  ...recordsOperations,
  ...groupsOperations,
  ...catalogOperations,
  ...socialOperations,
];
