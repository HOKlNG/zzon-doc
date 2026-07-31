/**
 * serverless-sample — 제네릭 서버리스 콘텐츠 파이프라인 예제 (API GW + Lambda 3종
 * + SQS/EventBridge + 외부 관리형 SaaS). 실제 프로젝트와 무관한 익명 예제다.
 *
 * 구성: API GW → api Lambda; SQS 2개(scrape/ai-process, DLQ+알람) → scraper
 * Lambda; EventBridge 크론 4개 → digest Lambda; DB/Redis는 외부 DB/Upstash로
 * 외부화(SSM 경유), 이메일은 SES SMTP. VPC는 프로비저닝돼 있으나 컴퓨트 미배치.
 */
import { diagram } from "../src/dsl/index.ts";

export default diagram("serverless-sample", { title: "Serverless Pipeline — dev (ap-northeast-2)" }, (d) => {
  // ── actors ──
  const mobile = d.actor("mobile", { icon: "res.mobile-client", label: "모바일 사용자", side: "left" });
  const deployer = d.actor("deployer", { icon: "res.user", label: "개발자 (deployer)", side: "left" });

  // ── AWS ──
  const cloud = d.group("aws", { kind: "aws-cloud", label: "AWS Cloud" });
  const region = cloud.group("region", { kind: "region", label: "ap-northeast-2 (Seoul)" });

  const apigw = region.node("apigw", {
    icon: "api-gateway",
    label: "API Gateway",
    sublabel: "HTTP API · $default",
  });
  const cognito = region.node("cognito", {
    icon: "cognito",
    label: "Cognito User Pool",
    sublabel: "Google IdP · Mobile Client",
  });

  const ecr = region.node("ecr", { icon: "ecr", label: "ECR ×3", sublabel: "api · scraper · digest" });
  const cron = region.node("cron", {
    icon: "eventbridge.scheduler",
    label: "EventBridge 크론 ×4",
    sublabel: "digest·source-poll 매시간 / FOMO 일·주간",
  });

  const fns = region.group("lambdas", { kind: "generic", label: "Lambda (컨테이너 이미지)" });
  const apiFn = fns.node("api", { icon: "lambda", label: "api", sublabel: "512MB · 30s" });
  const digestFn = fns.node("digest", { icon: "lambda", label: "digest", sublabel: "512MB · 240s" });
  const scraperFn = fns.node("scraper", { icon: "lambda", label: "scraper", sublabel: "1GB · Puppeteer" });

  const queues = region.group("sqs", { kind: "generic", label: "SQS" });
  const scrapeQ = queues.node("scrape", { icon: "sqs", label: "scrape queue", sublabel: "+DLQ · 알람" });
  const aiQ = queues.node("ai-process", { icon: "sqs", label: "ai-process queue", sublabel: "+DLQ · 알람" });

  const s3 = region.node("s3", { icon: "s3", label: "S3 assets" });
  const ses = region.node("ses", { icon: "simple-email-service", label: "SES", sublabel: "SMTP 587" });
  const ssm = region.node("ssm", {
    icon: "res.credentials",
    label: "SSM Parameter Store",
    sublabel: "DB·Redis URL / SMTP / API 키",
  });

  const obs = region.group("obs", { kind: "generic", label: "Observability" });
  const cw = obs.node("cw", { icon: "cloudwatch", label: "CloudWatch 알람 ×4", sublabel: "duration·errors·DLQ" });
  const sns = obs.node("sns", { icon: "simple-notification-service", label: "SNS alerts" });

  const vpc = region.group("vpc", { kind: "vpc", label: "VPC 10.0.0.0/16 — 컴퓨트 미배치" });
  vpc.node("igw", { icon: "igw", label: "IGW", sublabel: "public·private ×2 AZ, NAT는 prd만" });

  // ── external SaaS (오른쪽 밴드) ──
  d.band("right", (b) => {
    b.node("supabase", { icon: "res.database", label: "관리형 PostgreSQL", sublabel: "외부 SaaS" });
    b.node("upstash", { icon: "res.data-stream", label: "관리형 Redis (SaaS)" });
    b.node("openai", { icon: "res.globe", label: "LLM API" });
    b.node("google", { icon: "res.authenticated-user", label: "Google OAuth" });
    b.node("inbox", { icon: "res.email", label: "사용자 메일함" });
  });

  // ── request flow ──
  d.edge(mobile, apigw, { label: "HTTPS", layer: "request" });
  d.edge(apigw, apiFn, { layer: "request" });
  d.edge(apiFn, cognito, { label: "JWT 검증", style: { preset: "dotted" }, layer: "request" });
  d.edge(cognito, "band-right/google", { label: "OAuth", style: { preset: "dotted" }, layer: "request" });
  d.edge(apiFn, "band-right/supabase", { layer: "request" });
  d.edge(apiFn, "band-right/upstash", { layer: "request" });
  d.edge(apiFn, digestFn, { label: "admin poll", style: { preset: "dotted" }, layer: "request" });

  // ── ingestion pipeline ──
  d.edge(cron, digestFn, { layer: "pipeline" });
  d.edge(apiFn, scrapeQ, { label: "수집 요청", layer: "pipeline" });
  d.edge(digestFn, scrapeQ, { label: "RSS 폴링 발행", layer: "pipeline" });
  d.edge(scrapeQ, scraperFn, { label: "trigger", layer: "pipeline" });
  d.edge(scraperFn, aiQ, { label: "AI 처리 발행", layer: "pipeline" });
  d.edge(aiQ, scraperFn, { label: "trigger", layer: "pipeline" });
  d.edge(scraperFn, "band-right/openai", { label: "요약·태깅", layer: "pipeline" });
  d.edge(scraperFn, "band-right/supabase", { layer: "pipeline" });
  d.edge(scraperFn, s3, { layer: "pipeline" });

  // ── email ──
  d.edge(digestFn, ses, { label: "다이제스트 발송", layer: "email" });
  d.edge(ses, "band-right/inbox", { layer: "email" });

  // ── config / monitoring / deploy ──
  d.edge(fns, ssm, { label: "시크릿 로드", style: { preset: "dotted" }, layer: "config" });
  d.edge(cw, sns, { label: "알람", layer: "monitor" });
  d.edge(sns, "band-right/inbox", { style: { preset: "dotted" }, layer: "monitor" });
  d.edge(deployer, ecr, { label: "docker push", layer: "deploy" });
  d.edge(ecr, fns, { label: "이미지", style: { preset: "dotted" }, layer: "deploy" });

  // ── steps ──
  d.step(1, { at: mobile });
  d.step(2, { at: scrapeQ });
  d.step(3, { at: scraperFn });
  d.step(4, { at: aiQ });
  d.step(5, { at: digestFn, anchor: "ne" });
});
