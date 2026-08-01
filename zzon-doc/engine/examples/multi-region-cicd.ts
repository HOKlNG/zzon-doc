/**
 * Reference reproduction of screenshot S3: multi-region web service with CI/CD —
 * primary region ap-northeast-2 with a gridded VPC-01 (AZ columns x
 * public/private/database tiers, ELB spanning both AZs, multi-AZ ASG overlay,
 * Aurora writer/reader), a plain packed VPC-02, two satellite regions peered to
 * the primary VPC (group-endpoint edges), and a git push -> deploy pipeline.
 */
import { diagram } from "../src/dsl/index.ts";

// 리전 3개가 가로로 나열되는 본질적으로 넓은 다이어그램 — 종횡비 타깃을 명시
export default diagram("multi-region-cicd", { title: "Multi-Region Web Service with CI/CD", aspectRatio: 2.0 }, (d) => {
  const user = d.actor("user", { icon: "users", label: "사용자 (End Users)", side: "left" });
  const route53 = d.actor("route53", { icon: "r53", label: "Route 53", side: "top" });

  const cloud = d.group("aws-cloud", { kind: "aws-cloud", label: "AWS Cloud" });

  // ── CI/CD pipeline: pure layered flow (GitHub icon is trademark-restricted,
  //    so the official generic git-repository resource icon stands in) ──
  const cicd = cloud.group("cicd", { kind: "generic", label: "CI/CD", layout: "layered" });
  const github = cicd.node("github", { icon: "res.git-repository", label: "GitHub" });
  const pipeline = cicd.node("codepipeline", { icon: "codepipeline", label: "CodePipeline" });
  const deploy = cicd.node("codedeploy", { icon: "codedeploy", label: "CodeDeploy" });

  // ── Primary region: VPC-01 as AZ x tier grid ──
  const apne2 = cloud.group("apne2", { kind: "region", label: "ap-northeast-2 (Seoul)" });
  const vpc01 = apne2.grid("vpc-01", {
    kind: "vpc",
    label: "VPC-01",
    columns: [
      { id: "az-2a", label: "Availability Zone ap-northeast-2a" },
      { id: "az-2c", label: "Availability Zone ap-northeast-2c" },
    ],
    rows: ["public", "private", "database"],
  });

  // public tier: single subnet cell spanning both AZ columns — the ELB sits
  // centered across the AZs, with the NAT GW + bastion on the "2a" side
  const pub = vpc01.cell("az-2a", "public", { kind: "public-subnet", label: "Public subnet", colSpan: 2 });
  pub.node("natgw", { icon: "natgw", label: "NAT Gateway" });
  pub.node("bastion", { icon: "ec2.instance", label: "Bastion Host" });
  const elb = pub.node("elb", { icon: "elb", label: "Elastic Load Balancing" });

  const webs = [];
  for (const az of ["2a", "2c"] as const) {
    const priv = vpc01.cell(`az-${az}`, "private", { kind: "private-subnet", label: "Private subnet" });
    webs.push(priv.node(`web-${az}`, { icon: "ec2.instance", label: "Web Server" }));
  }
  // multi-AZ ASG expressed as an overlay inheriting the official group style
  vpc01.overlay("asg", { kind: "auto-scaling", label: "Auto Scaling Group", members: webs });

  const writer = vpc01
    .cell("az-2a", "database", { kind: "private-subnet", label: "DB subnet" })
    .node("aurora-writer", { icon: "res.aurora-mysql-instance", label: "Aurora Writer" });
  const reader = vpc01
    .cell("az-2c", "database", { kind: "private-subnet", label: "DB subnet" })
    .node("aurora-reader", { icon: "res.aurora-mysql-instance-alternate", label: "Aurora Reader" });

  // ── VPC-02: plain pack group with subnets as child groups ──
  const vpc02 = apne2.group("vpc-02", { kind: "vpc", label: "VPC-02", layout: "pack" });
  vpc02.group("public", { kind: "public-subnet", label: "Public subnet" }).node("proxy", {
    icon: "ec2.instance",
    label: "Proxy",
  });
  vpc02.group("private", { kind: "private-subnet", label: "Private subnet" }).node("apps", {
    icon: "ec2.instances",
    label: "Internal Apps",
  });

  // ── Satellite regions, each with a small VPC ──
  const use1 = cloud.group("use1", { kind: "region", label: "us-east-1 (N. Virginia)" });
  const use1Vpc = use1.group("vpc", { kind: "vpc", label: "VPC" });
  use1Vpc.node("web", { icon: "ec2.instance", label: "Web Server" });

  const euc1 = cloud.group("euc1", { kind: "region", label: "eu-central-1 (Frankfurt)" });
  const euc1Vpc = euc1.group("vpc", { kind: "vpc", label: "VPC" });
  euc1Vpc.node("web", { icon: "ec2.instance", label: "Web Server" });

  // ── Peering: VPC groups as edge endpoints, across regions ──
  d.edge(vpc01, use1Vpc, { label: "Peering", layer: "network", style: { preset: "dashed" } });
  d.edge(vpc01, euc1Vpc, { label: "Peering", layer: "network", style: { preset: "dashed" } });
  d.edge(vpc01, vpc02, { label: "Peering", layer: "network", style: { preset: "dashed" } });

  // ── Serving path ──
  d.edge(user, route53, { label: "DNS", layer: "network", style: { preset: "dotted" } });
  d.edge(user, elb, { label: "HTTPS", layer: "network" });
  d.edge(elb, webs[0]!, { layer: "network" });
  d.edge(elb, webs[1]!, { layer: "network" });
  d.edge(writer, reader, { label: "Replication", layer: "network", style: { preset: "dashed" } });

  // ── git push -> deploy flow ──
  d.edge(github, pipeline, { label: "Webhook", layer: "deploy" });
  d.edge(pipeline, deploy, { layer: "deploy" });
  d.edge(deploy, webs[0]!, { label: "Deploy", layer: "deploy" });
  d.edge(deploy, webs[1]!, { layer: "deploy" });
  d.edge(deploy, "use1/vpc/web", { layer: "deploy" }); // suffix-path escape hatch

  d.step(1, { at: github, note: "git push" });
  d.step(2, { at: pipeline });
  d.step(3, { at: deploy, anchor: "ne" });
  d.step(4, { at: webs[0]!, note: "rolling deploy" });
});
