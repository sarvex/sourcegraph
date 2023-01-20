package executor

import (
	"context"

	"github.com/sourcegraph/sourcegraph/internal/executor"
)

type LogEntryStore interface {
	AddExecutionLogEntry(ctx context.Context, job Job, entry executor.ExecutionLogEntry) (int, error)
	UpdateExecutionLogEntry(ctx context.Context, job Job, entryID int, entry executor.ExecutionLogEntry) error
}
