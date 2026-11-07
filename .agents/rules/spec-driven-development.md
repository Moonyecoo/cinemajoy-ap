---
description: Enforce GitHub Spec-Kit Spec-Driven Development (SDD) and Token-Saving guidelines on all coding tasks
globs: "*"
---

# Spec-Driven Development & Token Conservation Rule

1. **Strict Spec-Driven & EGM Workflow**:
   - For all non-trivial changes, follow the Spec-Kit pipeline: Spec -> Plan -> EGM Goldfish Review -> Tasks -> Implement -> Test.
   - Elephant phase (primary agent) formulates designs; Goldfish phase (zero-context subagent) stress-tests before writing code.
   - Reference `.specify/memory/constitution.md` for project principles.
   - Never generate uncontrolled code edits without a concrete task breakdown.

2. **Aggressive Token Preservation**:
   - Use `edit_file` with precise `Target` and `Replacement` blocks instead of rewriting entire files.
   - Suppress tangents, pleasantries, and unnecessary conversational recaps.
   - Structure responses with immediate executable commands first.

3. **Brand & Code Hygiene**:
   - Product name: **影悦 (CinemaJoy)**.
   - Zero references to competitor or third-party products (TVBox, Weikan, Apple CMS, etc.) in code or comments.

4. **Quality Gate**:
   - Always verify changes with `npm test` before concluding.

