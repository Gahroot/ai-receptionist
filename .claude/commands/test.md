Run the test suite for this project.

## Run Tests

```bash
npx jest --no-coverage $ARGUMENTS
```

## On Failure

If any tests fail, spawn parallel agents using the Task tool (subagent_type: general-purpose) to fix all failing test suites simultaneously. Each agent should:

1. Read the failing test file and the source file it tests
2. Understand the actual behavior vs expected behavior
3. Fix the test or source code as appropriate
4. Do NOT run tests — the orchestrator will re-run after all fixes

After all agents complete, re-run the tests. Repeat until all tests pass.

## Options

Common usage patterns:

- `/test` — run all tests
- `/test --watch` — run in watch mode
- `/test --coverage` — run with coverage report
- `/test stores` — run only store tests (matches path pattern)
- `/test --testPathPattern=integration` — run only integration tests
- `/test -t "login"` — run only tests matching name pattern
