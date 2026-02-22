---
name: fix
description: Run typechecking and linting, then spawn parallel agents to fix all issues
---

# Project Code Quality Check

This command runs all linting and typechecking tools, collects errors, groups them by domain, and spawns parallel agents to fix them.

## Step 1: Run Linting and Typechecking

Run both commands and capture all output:

```bash
npx tsc --noEmit 2>&1
npx eslint . 2>&1
```

## Step 2: Collect and Parse Errors

Parse the output from both commands. Group errors by domain:
- **Type errors**: Issues from `tsc --noEmit`
- **Lint errors**: Issues from `eslint`

Create a list of all files with issues and the specific problems in each file.

If there are no errors or warnings, report that all checks pass and stop.

## Step 3: Spawn Parallel Agents

For each domain that has issues, spawn an agent in parallel using the Task tool:

**IMPORTANT**: Use a SINGLE response with MULTIPLE Task tool calls to run agents in parallel.

- Spawn a **"type-fixer"** agent for TypeScript type errors
- Spawn a **"lint-fixer"** agent for ESLint errors and warnings

Each agent should:
1. Receive the full list of files and specific errors in their domain
2. Read each affected file
3. Fix all errors in their domain
4. Run the relevant check command to verify fixes:
   - Type fixer runs: `npx tsc --noEmit`
   - Lint fixer runs: `npx eslint .`
5. Iterate until all issues in their domain are resolved

## Step 4: Verify All Fixes

After all agents complete, run the full check again:

```bash
npx tsc --noEmit 2>&1
npx eslint . 2>&1
```

Confirm all issues are resolved. If any remain, fix them directly.
