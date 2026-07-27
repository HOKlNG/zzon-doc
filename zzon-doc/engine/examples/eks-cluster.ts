/**
 * Reference reproduction of screenshot S2: production EKS cluster —
 * AZ x subnet-tier grid VPC, dual spanning overlays (Karpenter NodePool /
 * Critical Addons MNG), border rail, right monitoring band, bottom IAM band,
 * numbered step markers.
 */
import { diagram } from "../src/dsl/index.ts";

export default diagram("eks-cluster", { title: "Production EKS Cluster" }, (d) => {
  const devops = d.actor("devops", { icon: "users", label: "DevOps / Platform Engineers", side: "left" });
  const users = d.actor("users", { icon: "res.users", label: "Users", side: "left" });
  const terraform = d.node("terraform", { icon: "res.source-code", label: "Terraform" });

  const cloud = d.group("aws-cloud", { kind: "aws-cloud", label: "AWS Cloud" });
  const region = cloud.group("region", { kind: "region", label: "Region" });

  const vpc = region.grid("vpc", {
    kind: "vpc",
    label: "VPC",
    columns: [
      { id: "az-a", label: "Availability Zone A" },
      { id: "az-b", label: "Availability Zone B" },
      { id: "az-c", label: "Availability Zone C" },
    ],
    rows: ["public", "private", "intra"],
  });

  vpc.rail("W", [
    { id: "ecr", icon: "ecr", label: "ECR" },
    { id: "eks", icon: "eks", label: "EKS" },
    { id: "ec2", icon: "ec2", label: "EC2" },
    { id: "ebs", icon: "elastic-block-store", label: "EBS" },
  ]);

  const azs = ["a", "b", "c"] as const;
  const addonIcons = [
    { icon: "x.kubernetes", label: "FluentBit" },
    { icon: "x.external-secrets", label: "ESO / Cert Manager" },
    { icon: "x.kubernetes", label: "Grafana Operator" },
  ] as const;

  const enis = [];
  for (let i = 0; i < azs.length; i++) {
    const az = azs[i]!;
    vpc.cell(`az-${az}`, "public", { kind: "public-subnet", label: "Public subnet" });

    const priv = vpc.cell(`az-${az}`, "private", { kind: "private-subnet", label: `Private subnet ${i + 1}` });
    priv.node(`nodes-${az}`, { icon: "ec2.instances", label: "c7g / m7g / r7g", ...(i === 0 ? {} : {}) });
    priv.node(`addon-${az}`, { icon: addonIcons[i]!.icon, label: addonIcons[i]!.label });
    priv.node(`critical-${az}`, {
      icon: i === 0 ? "elastic-kubernetes-service" : i === 1 ? "x.karpenter" : "elastic-load-balancing",
      label: i === 0 ? "VPC CNI" : i === 1 ? "Karpenter" : "AWS LB Controller",
    });

    const intra = vpc.cell(`az-${az}`, "intra", { kind: "private-subnet", label: `Intra subnet ${i + 1}` });
    enis.push(intra.node(`eni-${az}`, { icon: "eni", label: "EKS Managed ENI" }));
  }

  vpc.overlay("karpenter-pool", {
    label: "Karpenter NodePool",
    style: "dashed-green",
    members: azs.flatMap((az) => [`vpc/az-${az}/private/nodes-${az}`, `vpc/az-${az}/private/addon-${az}`]),
  });
  vpc.overlay("critical-addons", {
    label: "Critical Addons — EKS MNG",
    style: "dashed-orange",
    members: azs.map((az) => `vpc/az-${az}/private/critical-${az}`),
  });

  const nlb = region.node("nlb", { icon: "nlb", label: "Network Load Balancer" });
  const eksCluster = region.node("eks-cluster", { icon: "eks", label: "Production EKS Cluster" });

  d.band("right", (b) => {
    b.node("amg", { icon: "amg", label: "Amazon Managed Grafana" });
    b.node("amp", { icon: "amp", label: "Amazon Managed Service for Prometheus" });
    b.node("collector", { icon: "cloudwatch", label: "Agentless Collector" });
  });

  d.band("bottom", (b) => {
    for (const role of ["Cluster Admin", "Admin", "Editor", "Reader"]) {
      b.node(`role-${role.toLowerCase().replace(/ /g, "-")}`, { icon: "iam-role", label: `${role} Role` });
    }
  });

  d.edge(devops, terraform, {});
  d.edge(terraform, "aws-cloud/region/vpc", { label: "provision", layer: "deploy" });
  d.edge(users, nlb, { label: "HTTPS", layer: "network" });
  for (const eni of enis) d.edge(nlb, eni, { layer: "network" });
  d.edge("band-right/amg", "band-right/amp", { style: { preset: "dotted" }, layer: "monitoring" });
  d.edge("band-right/collector", "band-right/amp", { layer: "monitoring" });
  d.edge(eksCluster, "vpc/az-b/intra/eni-b", { layer: "network" });

  d.step(1, { at: devops });
  d.step(2, { at: terraform });
  d.step(3, { at: "aws-cloud/region/vpc" });
  d.step(5, { at: eksCluster });
  d.step(8, { at: users });
});
