/**
 * 레거시 카테고리 어휘 -> AWS 아이콘 어휘 큐레이션 매핑 (compat 전용).
 *
 * 정책은 여기 없다 — 호출자가 vocabulary:"aws"를 명시했을 때만 쓰이는 메커니즘이다.
 * 원칙: 전부-아니면-카드. 한 노드라도 확신 있게 매핑하지 못하면 다이어그램 전체가
 * 카드 어휘로 남는다(혼용 원천 차단, 실패 목록은 warning으로 보고).
 *
 * tech 문자열 힌트가 카테고리 기본값보다 우선한다 (예: db + "DynamoDB" -> dynamodb).
 */
import { ICON_PATHS } from "../icons/manifest.gen.ts";
import { ICON_ALIASES, type IconRef } from "../icons/aliases.ts";

const exists = (key: string): boolean => key in ICON_PATHS || key in ICON_ALIASES;

/** 후보를 순서대로 시도해 실재하는 첫 키를 돌려준다 */
const pick = (...candidates: string[]): IconRef | null => {
  for (const c of candidates) if (exists(c)) return c as IconRef;
  return null;
};

/** tech 힌트: 부분 문자열(소문자) -> 아이콘 후보 */
const TECH_HINTS: [string, string[]][] = [
  ["dynamo", ["dynamodb"]],
  ["aurora", ["aurora"]],
  ["postgres", ["rds"]],
  ["mysql", ["rds"]],
  ["mariadb", ["rds"]],
  ["supabase", ["res.database"]],
  ["redis", ["elasticache.elasticache-for-redis", "elasticache"]],
  ["memcached", ["elasticache.elasticache-for-memcached", "elasticache"]],
  ["kafka", ["managed-streaming-for-apache-kafka", "sqs"]],
  ["sqs", ["sqs"]],
  ["sns", ["sns"]],
  ["kinesis", ["kinesis"]],
  ["lambda", ["lambda"]],
  ["fargate", ["fargate", "elastic-container-service"]],
  ["ecs", ["elastic-container-service"]],
  ["eks", ["eks"]],
  ["kubernetes", ["eks"]],
  ["ec2", ["ec2"]],
  ["s3", ["s3"]],
  ["cloudfront", ["cloudfront"]],
  ["cognito", ["cognito"]],
  ["opensearch", ["opensearch-service"]],
  ["elasticsearch", ["opensearch-service"]],
  ["athena", ["athena"]],
  ["step function", ["step-functions"]],
  ["eventbridge", ["eventbridge.scheduler", "eventbridge"]],
  ["ses", ["simple-email-service"]],
  ["expo", ["res.mobile-client"]],
];

/** 카테고리 기본값 (tech 힌트가 없거나 안 맞을 때) */
const CATEGORY_DEFAULTS: Record<string, string[]> = {
  user: ["res.user"],
  users: ["res.users"],
  frontend: ["res.client", "res.generic-application"],
  mobile: ["res.mobile-client"],
  admin: ["res.management-console", "res.user"],
  backend: ["res.generic-application"],
  service: ["res.generic-application"],
  worker: ["res.gear", "res.generic-application"],
  lambda: ["lambda"],
  scheduler: ["eventbridge.scheduler", "eventbridge"],
  db: ["rds", "res.database"],
  cache: ["elasticache", "res.generic-application"],
  queue: ["sqs"],
  storage: ["s3"],
  cdn: ["cloudfront"],
  gateway: ["api-gateway"],
  auth: ["cognito"],
  search: ["opensearch-service"],
  monitor: ["cloudwatch"],
  notification: ["sns"],
  email: ["simple-email-service"],
  dns: ["route-53"],
  external: ["res.globe"],
  infra: ["res.servers", "res.server"],
  network: ["vpc.router", "res.globe"],
};

export interface AwsVocabResult {
  /** node id -> icon (전 노드 매핑 성공 시에만 non-null) */
  icons: Map<string, IconRef> | null;
  /** 매핑 실패 노드와 사유 (전체 카드 폴백의 근거 보고용) */
  failures: string[];
}

/** 노드 목록 전체를 한 번에 판정한다 — 부분 성공은 없다 */
export function mapAwsVocabulary(
  nodes: { id: string; category: string; tech?: string }[],
): AwsVocabResult {
  const icons = new Map<string, IconRef>();
  const failures: string[] = [];
  for (const n of nodes) {
    const tech = (n.tech ?? "").toLowerCase();
    let icon: IconRef | null = null;
    for (const [hint, candidates] of TECH_HINTS) {
      if (tech.includes(hint)) {
        icon = pick(...candidates);
        if (icon) break;
      }
    }
    if (!icon) icon = pick(...(CATEGORY_DEFAULTS[n.category] ?? []));
    if (!icon) {
      failures.push(`"${n.id}" (category: ${n.category}${n.tech ? `, tech: ${n.tech}` : ""})`);
      continue;
    }
    icons.set(n.id, icon);
  }
  return failures.length ? { icons: null, failures } : { icons, failures };
}
