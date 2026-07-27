import type { IconKey } from "./manifest.gen.ts";

/** Hand-maintained shorthand aliases -> canonical manifest keys. */
export const ICON_ALIASES = {
  eks: "elastic-kubernetes-service",
  ecs: "elastic-container-service",
  ecr: "elastic-container-registry",
  s3: "simple-storage-service",
  ebs: "elastic-block-store",
  efs: "efs",
  alb: "elastic-load-balancing.application-load-balancer",
  nlb: "elastic-load-balancing.network-load-balancer",
  elb: "elastic-load-balancing",
  igw: "vpc.internet-gateway",
  natgw: "vpc.nat-gateway",
  eni: "vpc.elastic-network-interface",
  "vpc-endpoints": "vpc.endpoints",
  peering: "vpc.peering-connection",
  tgw: "transit-gateway",
  "tgw-attachment": "transit-gateway.attachment",
  dx: "direct-connect",
  vpn: "site-to-site-vpn",
  nfw: "network-firewall",
  iam: "identity-and-access-management",
  "iam-role": "identity-access-management.role",
  sso: "iam-identity-center",
  kms: "key-management-service",
  acm: "certificate-manager",
  r53: "route-53",
  cw: "cloudwatch",
  sns: "simple-notification-service",
  sqs: "simple-queue-service",
  ddb: "dynamodb",
  amp: "managed-service-for-prometheus",
  amg: "managed-grafana",
  mwaa: "managed-workflows-for-apache-airflow",
  asg: "ec2-auto-scaling",
  users: "res.users",
  user: "res.user",
  internet: "res.internet-alt1",
  "on-premises": "res.office-building",
  "corporate-dc": "group.corporate-data-center",
} as const satisfies Record<string, IconKey>;

export type IconAlias = keyof typeof ICON_ALIASES;
export type IconRef = IconKey | IconAlias;

export function resolveIcon(ref: IconRef): IconKey {
  return (ICON_ALIASES as Record<string, IconKey>)[ref] ?? (ref as IconKey);
}
