/**
 * serverless-sample — 제네릭 서버리스 콘텐츠 파이프라인 예제 (API GW + Lambda 3종
 * + SQS/EventBridge + 외부 관리형 SaaS). 실제 프로젝트와 무관한 익명 예제다.
 *
 * 구성: API GW → api Lambda; SQS 2개(scrape/ai-process, DLQ+알람) → scraper
 * Lambda; EventBridge 크론 4개 → digest Lambda; DB/Redis는 외부 DB/Upstash로
 * 외부화(SSM 경유), 이메일은 SES SMTP. VPC는 프로비저닝돼 있으나 컴퓨트 미배치.
 *
 * 작성 의도(selection-rubric): view "deployment", tier "reference"(22노드 원장).
 * 열 구조는 hints.layer로 밝힌다 — 진입(0) → Lambda(1) → 큐·인증(2) → 저장·발송·설정(3).
 * 관측·VPC는 횡단 관심사라 각 열의 맨 아래(order 큼)에 둔다(축소 사다리 2단계의 배치판).
 */
import { diagram } from "../src/dsl/index.ts";

export default diagram(
  "serverless-sample",
  { title: "서버리스 콘텐츠 수집 파이프라인 (개발 환경)", view: "deployment", tier: "reference", direction: "RIGHT" },
  (d) => {
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
    hints: { layer: 0, order: 0 },
  });
  const cognito = region.node("cognito", {
    icon: "cognito",
    label: "Cognito User Pool",
    sublabel: "Google IdP · Mobile Client",
    hints: { layer: 2, order: 1 },
  });

  const ecr = region.node("ecr", { icon: "ecr", label: "ECR ×3", sublabel: "api · scraper · digest", hints: { layer: 0, order: 2 } });
  const cron = region.node("cron", {
    icon: "eventbridge.scheduler",
    label: "EventBridge 크론 ×4",
    sublabel: "digest·source-poll 매시간 / FOMO 일·주간",
    hints: { layer: 0, order: 1 },
  });

  const fns = region.group("lambdas", { kind: "generic", label: "Lambda (컨테이너 이미지)", hints: { layer: 1, order: 0 } });
  const apiFn = fns.node("api", { icon: "lambda", label: "api", sublabel: "512MB · 30s", hints: { layer: 0, order: 0 } });
  const digestFn = fns.node("digest", { icon: "lambda", label: "digest", sublabel: "512MB · 240s", hints: { layer: 0, order: 1 } });
  const scraperFn = fns.node("scraper", { icon: "lambda", label: "scraper", sublabel: "1GB · Puppeteer", hints: { layer: 0, order: 2 } });

  const queues = region.group("sqs", { kind: "generic", label: "SQS", hints: { layer: 2, order: 0 } });
  const scrapeQ = queues.node("scrape", { icon: "sqs", label: "scrape queue", sublabel: "+DLQ · 알람", hints: { layer: 0, order: 0 } });
  const aiQ = queues.node("ai-process", { icon: "sqs", label: "ai-process queue", sublabel: "+DLQ · 알람", hints: { layer: 0, order: 1 } });

  const s3 = region.node("s3", { icon: "s3", label: "S3 assets", hints: { layer: 3, order: 0 } });
  const ses = region.node("ses", { icon: "simple-email-service", label: "SES", sublabel: "SMTP 587", hints: { layer: 3, order: 1 } });
  const ssm = region.node("ssm", {
    icon: "res.credentials",
    label: "SSM Parameter Store",
    sublabel: "DB·Redis URL / SMTP / API 키",
    hints: { layer: 3, order: 2 },
  });

  const obs = region.group("obs", { kind: "generic", label: "Observability", hints: { layer: 0, order: 3 } });
  const cw = obs.node("cw", { icon: "cloudwatch", label: "CloudWatch 알람 ×4", sublabel: "duration·errors·DLQ" });
  const sns = obs.node("sns", { icon: "simple-notification-service", label: "SNS alerts" });

  const vpc = region.group("vpc", { kind: "vpc", label: "VPC 10.0.0.0/16 — 컴퓨트 미배치", hints: { layer: 3, order: 3 } });
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
  const r1 = d.edge(mobile, apigw, { label: "HTTPS", layer: "request" });
  const r2 = d.edge(apigw, apiFn, { layer: "request" });
  d.edge(apiFn, cognito, { label: "JWT 검증", style: { preset: "dotted" }, layer: "request" });
  d.edge(cognito, "band-right/google", { label: "OAuth", style: { preset: "dotted" }, layer: "request" });
  d.edge(apiFn, "band-right/supabase", { layer: "request" });
  d.edge(apiFn, "band-right/upstash", { layer: "request" });
  d.edge(apiFn, digestFn, { label: "admin poll", style: { preset: "dotted" }, layer: "request" });

  // ── ingestion pipeline ──
  d.edge(cron, digestFn, { layer: "pipeline" });
  const p1 = d.edge(apiFn, scrapeQ, { label: "수집 요청", layer: "pipeline" });
  d.edge(digestFn, scrapeQ, { label: "RSS 폴링 발행", layer: "pipeline" });
  const p2 = d.edge(scrapeQ, scraperFn, { label: "trigger", layer: "pipeline" });
  const p3 = d.edge(scraperFn, aiQ, { label: "AI 처리 발행", layer: "pipeline" });
  const p4 = d.edge(aiQ, scraperFn, { label: "trigger", layer: "pipeline" });
  const p5 = d.edge(scraperFn, "band-right/openai", { label: "요약·태깅", layer: "pipeline" });
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

  // ── representative path (T3 원장은 flow로 경로를 강조해야 읽힌다) ──
  d.flow("ingest", {
    title: "콘텐츠 수집",
    description: "모바일 요청부터 AI 요약까지 이어지는 비동기 파이프라인입니다.",
    steps: [
      { edge: r1, text: "모바일 앱이 API Gateway로 요청합니다" },
      { edge: r2, text: "API 함수가 요청을 처리합니다" },
      { edge: p1, text: "수집 요청을 수집 큐에 넣습니다" },
      { edge: p2, text: "수집 함수가 큐 메시지를 받아 실행됩니다" },
      { edge: p3, text: "AI 처리 메시지를 발행합니다" },
      { edge: p4, text: "수집 함수가 AI 처리 메시지를 받아 다시 실행됩니다" },
      { edge: p5, text: "LLM API로 요약하고 태그를 붙입니다" },
    ],
  });

  // ── steps ──
  d.step(1, { at: mobile });
  d.step(2, { at: scrapeQ });
  d.step(3, { at: scraperFn });
  d.step(4, { at: aiQ });
  d.step(5, { at: digestFn, anchor: "ne" });
});
