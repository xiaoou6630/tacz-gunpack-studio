---
name: tacz-learner
description: Turn review defects into short, testable lessons in LESSONS.md; optionally distill a role skill and keep every rewrite rollback-safe.
whenToUse: Use after a build/review round, or when the same mistake repeats across guns.
---

# TACZ Learner

## Inputs

- Reviewer findings, fixes, and the final validation result.
- Target role: `modeler`, `reviewer`, `data-smith`, `researcher`, or `learner`.

## Procedure

1. Read the role skill with `tacz_skill action="read" role=<role>`; read history with `tacz_skill action="lessons" role=<role>` when needed.
2. Write one lesson per **distinct** defect: symptom → cause → one concrete rule → verification command. Keep each under 300 characters.
3. `tacz_skill action="learn" role=<role> text="..." source="vendor/TACZ|TACZ_SOURCE|repo@ref#sha" apply=false` — the lesson goes to `LESSONS.md` and `CHANGELOG.jsonl`; `apply=true` is legacy and would append it to `SKILL.md`, inflating every prompt.
4. Distill only when a teacher route is configured:
   `tacz_skill action="distill" role=<role> provider=... model=... apply=true`.
   The rewrite must keep frontmatter, role boundary, and handoff JSON; reject credentials, absolute user paths, or >24KB.
5. Verify with `tacz_skill action="lessons"` and `tacz_skill action="history"`.
6. If the rewrite is worse, `tacz_skill action="rollback" role=<role>`.

## PTC usage

- Batch the lessons for all roles in one `run_code` program, or write `LESSONS.md` once and then call `tacz_skill` only for versioned rewrites.
- Do not spend one model step per lesson; return the written paths and counts.

## When you are unsure

- The role skills and tool results are your source of truth. If a fact is in neither, and the pack on disk does not show it, **ask the user** with `ask_user_question` instead of guessing.
- Never invent file layouts, field names, group names, bone names, numbers, or sound keys. A wrong guess costs a full rebuild.
- Never search the workspace for a spec document: this skill is self-contained and there is no spec file to find. If the skill does not cover a detail, ask.
- Ask only about decisions the user owns (caliber, style, mechanics, whether animation is needed). Anything a tool can answer, answer by running the tool first.
- If a required input is missing, return `status="blocked"` with `next=["need:user:<question>"]` and the concrete question, rather than producing partial work built on an assumption.

## Rules

- Never edit another role's skill to compensate for this role's mistake.
- Write only under `~/.dsh/tacz-gunpack/skills/`; never touch pack files, geometry, data, or scripts.
- Do not put gun-specific dimensions in a skill; they belong in the design brief.
- Do not append lessons to `SKILL.md`; lessons live in `LESSONS.md`, so they do not inflate every prompt.
- Every lesson records its source: local path **kind** (`TACZ_SOURCE`/`vendor/TACZ`/jar extract) or GitHub `repo@ref` + sha; never a machine-specific absolute path.
- Return the handoff JSON with lesson count, versions written, and any rollback.

## Self-checks

- [ ] Each lesson is testable and names the verification.
- [ ] No credential, absolute path, or one-off gun dimension.
- [ ] `SKILL.md` size did not grow; `LESSONS.md` did.
