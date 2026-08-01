/**
 * Reference reproduction of screenshot S1: multi-account Landing Zone —
 * management account with SCP fan-out to 7 OUs (governance layer), account
 * field (Security / Workloads / Infrastructure OUs, stacked accounts), team
 * VPCs attaching to a central Transit Gateway (the fan-in bundling showcase),
 * perimeter inspection VPC, and hybrid connectivity (DX + VPN) on the right.
 */
import { diagram } from "../src/dsl/index.ts";

export default diagram("multi-account-lz", { title: "AWS Multi-Account Landing Zone" }, (d) => {
  const internet = d.actor("internet", { icon: "internet", label: "Internet", side: "right" });
  const onprem = d.actor("on-premises", {
    icon: "on-premises",
    label: "온프레미스 데이터센터", // On-premises data center (CJK label exercise)
    side: "right",
  });

  const cloud = d.group("aws-cloud", { kind: "aws-cloud", label: "AWS Cloud" });

  // ── Management account: SCP node fanning out to the 7 OUs ──
  // auto resolves to pack here: the SCP->OU fan-out (depth 1, degree 7) would
  // degenerate to a vertical stripe under layered; the global router draws the fan
  const mgmt = cloud.group("management", { kind: "account", label: "Management Account" });
  const scp = mgmt.node("scp", { icon: "organizations", label: "Service Control Policies (SCPs)" });
  mgmt.node("control-tower", { icon: "control-tower", label: "AWS Control Tower" });
  const ous = [
    "Security",
    "Infrastructure",
    "Workloads",
    "Sandbox",
    "Deployments",
    "Policy Staging",
    "Suspended",
  ].map((name) =>
    mgmt.node(`ou-${name.toLowerCase().replace(/ /g, "-")}`, {
      icon: "organizations.organizational-unit",
      label: `${name} OU`,
    }),
  );

  // ── Security OU: Log Archive + Security Tooling accounts ──
  const security = cloud.group("security-ou", { kind: "generic", label: "Security OU" });
  const logArchive = security.group("log-archive", { kind: "account", label: "Log Archive" });
  logArchive.node("audit-logs", { icon: "s3", label: "S3 Immutable", sublabel: "Object Lock + Versioning" });
  const secTooling = security.group("security-tooling", {
    kind: "account",
    label: "Security Tooling",
    badges: ["security-hub", "macie", "guardduty"],
  });
  secTooling.node("delegated-admin", { icon: "security-hub", label: "Delegated Admin" });

  // ── Sandbox accounts (shadow-stacked "-N") ──
  const sandbox = cloud.group("sandbox-n", { kind: "account", label: "Sandbox-N", stack: 3 });
  sandbox.node("experiments", { icon: "ec2", label: "Experiments" });

  // ── Workloads OU: Dev/Test/Prod team accounts, each holding a VPC ──
  const workloads = cloud.group("workloads-ou", { kind: "generic", label: "Workloads OU" });
  const teamVpcs = [];
  for (const env of ["Dev", "Test", "Prod"] as const) {
    for (const team of ["1", "N"] as const) {
      const acct = workloads.group(`${env.toLowerCase()}-team-${team.toLowerCase()}`, {
        kind: "account",
        label: `${env}-Team-${team}`,
        stack: team === "N" ? true : undefined,
      });
      // tiny service icons only — the VPC renders as a small badged box
      teamVpcs.push(acct.group("vpc", { kind: "vpc", label: `${env} VPC`, badges: ["eks", "rds", "s3"] }));
    }
  }

  // ── End users / desktops account (manifest has no appstream key → WorkDocs) ──
  const endUsers = cloud.group("end-users", { kind: "account", label: "End Users / Desktops" });
  endUsers.node("workspaces", { icon: "workspaces", label: "WorkSpaces" });
  endUsers.node("workdocs", { icon: "workdocs", label: "WorkDocs" });

  // ── Infrastructure OU: Operations / DevOps / Shared Network / Perimeter ──
  const infra = cloud.group("infrastructure-ou", { kind: "generic", label: "Infrastructure OU" });

  const ops = infra.group("operations", { kind: "account", label: "Operations" });
  ops.node("cloudwatch", { icon: "cw", label: "CloudWatch" });
  ops.node("config", { icon: "config", label: "AWS Config" });

  const devops = infra.group("devops", { kind: "account", label: "DevOps" });
  devops.node("pipeline", { icon: "codepipeline", label: "CodePipeline" });
  devops.node("build", { icon: "codebuild", label: "CodeBuild" });

  const sharedNet = infra.group("shared-network", { kind: "account", label: "Shared Network" });
  const centralVpc = sharedNet.group("central-vpc", { kind: "vpc", label: "Central VPC" });
  const endpointVpc = sharedNet.group("endpoint-vpc", { kind: "vpc", label: "Endpoint VPC" });
  endpointVpc.node("endpoints", { icon: "vpc-endpoints", label: "Interface Endpoints" });
  const tgw = sharedNet.node("tgw", { icon: "tgw", label: "Transit Gateway" });
  const dx = sharedNet.node("dx", { icon: "dx", label: "Direct Connect" });
  const vpn = sharedNet.node("vpn", { icon: "vpn", label: "Site-to-Site VPN" });

  const perimeter = infra.group("perimeter", { kind: "account", label: "Perimeter Security" });
  const inspectionVpc = perimeter.group("inspection-vpc", {
    kind: "vpc",
    label: "Inspection VPC",
    badges: ["waf"],
  });
  inspectionVpc.node("nfw", { icon: "nfw", label: "Network Firewall" });
  inspectionVpc.node("alb", { icon: "alb", label: "Application Load Balancer" });
  inspectionVpc.node("igw", { icon: "igw", label: "Internet Gateway" });
  inspectionVpc.node("natgw", { icon: "natgw", label: "NAT Gateway" });

  // ── Governance: SCP fan-out to all 7 OUs (natural fan-out bundling ≥ 4) ──
  for (const ou of ous) d.edge(scp, ou, { layer: "governance", style: { preset: "dashed" } });

  // ── Network: every VPC attaches to the TGW — 8-edge fan-in, GROUP endpoints ──
  for (const vpc of teamVpcs) {
    d.edge(vpc, tgw, { label: "VPC Attach", layer: "network", hints: { bundle: "tgw-attach" } });
  }
  d.edge(centralVpc, tgw, { label: "VPC Attach", layer: "network", hints: { bundle: "tgw-attach" } });
  d.edge(endpointVpc, tgw, { label: "VPC Attach", layer: "network", hints: { bundle: "tgw-attach" } });

  d.edge(tgw, inspectionVpc, { label: "Egress", layer: "network" });
  d.edge(internet, "inspection-vpc/igw", { layer: "network" }); // suffix-path escape hatch

  // ── Hybrid connectivity: on-premises reaches the TGW via DX and VPN ──
  d.edge(onprem, dx, { label: "Direct Connect", layer: "hybrid" });
  d.edge(dx, tgw, { layer: "hybrid" });
  d.edge(onprem, vpn, { label: "IPSec VPN", layer: "hybrid", style: { preset: "dashed" } });
  d.edge(vpn, tgw, { layer: "hybrid", style: { preset: "dashed" } });
});
