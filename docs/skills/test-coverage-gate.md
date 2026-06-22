# Test Coverage Gate

Hold every change to this bar. Cite the exact `file:line` for each finding.

## A test must exist for new behavior
- Every new branch, guard, or error path the diff adds needs an assertion that
  exercises it. A bug fix needs a regression test that fails without the fix.
- A new or changed public contract (response shape, status code, nullability,
  return type) needs a test that pins it.

## A test must be able to fail
- Reject vacuous tests: asserting a mock returns what it was told to, snapshotting
  then matching that same snapshot, or running code and asserting nothing.
- Ask: "if I broke the code under test, would this fail?" If no, flag it.

## Don't mock the thing under test
- Mocking the unit being verified makes the test pass regardless of the real
  implementation. Stub I/O and boundaries, not the logic you're proving.
- Assert observable behavior (output, persisted state, rendered result), not
  internal call order or private calls.

## Keep tests deterministic
- Flag real timers/sleeps, wall-clock or ordering dependence, unseeded randomness,
  and state leaking between cases. DB-backed tests must scope and clean per case.

Stay scoped to THIS diff — don't demand tests for pre-existing untested code
unless the change now depends on it. No padding: a clean test suite earns zero
findings.
