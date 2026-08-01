/**
 * AWS diagram group-border conventions, per the official
 * Architecture-Group-Icons deck (colors extracted from the 04302026 package).
 * Each kind maps to border style + optional corner badge icon key.
 */

export type GroupKind =
  | "aws-cloud"
  | "region"
  | "availability-zone"
  | "account"
  | "vpc"
  | "public-subnet"
  | "private-subnet"
  | "security-group"
  | "auto-scaling"
  | "corporate-data-center"
  | "server-contents"
  | "spot-fleet"
  | "generic";

import type { IconRef } from "../icons/aliases.ts";

export interface GroupStyle {
  stroke: string;
  strokeDasharray?: string;
  fill?: string;
  /** icon key rendered as a small badge in the top-left corner */
  badge?: IconRef;
  labelColor?: string;
}

export const GROUP_STYLES: Record<GroupKind, GroupStyle> = {
  "aws-cloud": { stroke: "#242F3E", badge: "group.aws-cloud" },
  region: { stroke: "#00A4A6", strokeDasharray: "6 3", badge: "group.region" },
  "availability-zone": { stroke: "#00A4A6", strokeDasharray: "2 4", labelColor: "#00A4A6" },
  account: { stroke: "#E7157B", badge: "group.account" },
  vpc: { stroke: "#8C4FFF", badge: "group.vpc" },
  "public-subnet": {
    stroke: "#7AA116",
    fill: "rgba(122,161,22,0.06)",
    badge: "group.public-subnet",
    labelColor: "#7AA116",
  },
  "private-subnet": {
    stroke: "#00A4A6",
    fill: "rgba(0,164,166,0.06)",
    badge: "group.private-subnet",
    labelColor: "#00A4A6",
  },
  "security-group": { stroke: "#DD344C", strokeDasharray: "4 3", labelColor: "#DD344C" },
  "auto-scaling": { stroke: "#ED7100", strokeDasharray: "6 3", badge: "group.auto-scaling" },
  "corporate-data-center": { stroke: "#7D8998", badge: "group.corporate-data-center" },
  "server-contents": { stroke: "#7D8998", badge: "group.server-contents" },
  "spot-fleet": { stroke: "#ED7100", badge: "group.spot-fleet" },
  generic: { stroke: "#7D8998", strokeDasharray: "4 3" },
};

/** AWS service category accent colors (for edges/labels if desired). */
export const CATEGORY_COLORS = {
  compute: "#ED7100",
  containers: "#ED7100",
  storage: "#7AA116",
  database: "#C925D1",
  networking: "#8C4FFF",
  security: "#DD344C",
  management: "#E7157B",
  analytics: "#8C4FFF",
  integration: "#E7157B",
} as const;
