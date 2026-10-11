# 트리거(라우팅) 평가

요청 문구 → 기대 스킬이 뜨는지 확인하는 회귀 테스트다. 스킬 설명(description·when_to_use)을 바꾸면 돌린다.

```bash
cd zzon-doc
claude plugin eval . --runs 1 --ablation none --model opus   # 빠른 확인
claude plugin eval . --tag trigger                             # 기본 3회 반복
```

- 케이스: `<이름>/prompt.md`(요청) + `graders/*.md`(`tool_used: Skill` 정규식).
- 메인 스킬(zzon-doc)이 받아야 할 요청 7종, 지명형(zzon-seq·terra-form·zzon-wiki) 3종, 무관 요청 1종(아무 zzon 스킬도 뜨면 안 됨).
- 결과 폴더(`evals/results/`)는 gitignore.
