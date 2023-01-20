package job

import (
	"context"
	"fmt"
	"net/http"

	otlog "github.com/opentracing/opentracing-go/log"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/sourcegraph/log"

	"github.com/sourcegraph/sourcegraph/enterprise/cmd/executor/internal/apiclient"
	"github.com/sourcegraph/sourcegraph/enterprise/cmd/executor/internal/apiclient/queue"
	"github.com/sourcegraph/sourcegraph/enterprise/internal/executor"
	internalexecutor "github.com/sourcegraph/sourcegraph/internal/executor"
	"github.com/sourcegraph/sourcegraph/internal/observation"
)

// Client is the client used to communicate with a remote job queue API.
type Client struct {
	options         queue.Options
	client          *apiclient.BaseClient
	logger          log.Logger
	metricsGatherer prometheus.Gatherer
	operations      *operations
}

// Compile time validation.
var _ executor.LogEntryStore = &Client{}

func New(observationCtx *observation.Context, options queue.Options, metricsGatherer prometheus.Gatherer) (*Client, error) {
	client, err := apiclient.NewBaseClient(options.BaseClientOptions)
	if err != nil {
		return nil, err
	}
	return &Client{
		options:         options,
		client:          client,
		logger:          log.Scoped("executor-api-queue-job-client", "The API client adapter for executors to use dbworkers over HTTP"),
		metricsGatherer: metricsGatherer,
		operations:      newOperations(observationCtx),
	}, nil
}

func (c *Client) AddExecutionLogEntry(ctx context.Context, job executor.Job, entry internalexecutor.ExecutionLogEntry) (entryID int, err error) {
	queueName := c.getQueue(job)
	ctx, _, endObservation := c.operations.addExecutionLogEntry.With(ctx, &err, observation.Args{LogFields: []otlog.Field{
		otlog.String("queueName", queueName),
		otlog.Int("jobID", job.ID),
	}})
	defer endObservation(1, observation.Args{})

	req, err := c.client.NewJSONJobRequest(
		http.MethodPost,
		fmt.Sprintf("%s/addExecutionLogEntry", queueName),
		job.Token,
		executor.AddExecutionLogEntryRequest{
			JobOperationRequest: executor.JobOperationRequest{
				ExecutorName: c.options.ExecutorName,
				JobID:        job.ID,
			},
			ExecutionLogEntry: entry,
		},
	)
	if err != nil {
		return entryID, err
	}

	_, err = c.client.DoAndDecode(ctx, req, &entryID)
	return entryID, err
}

func (c *Client) UpdateExecutionLogEntry(ctx context.Context, job executor.Job, entryID int, entry internalexecutor.ExecutionLogEntry) (err error) {
	queueName := c.getQueue(job)
	ctx, _, endObservation := c.operations.updateExecutionLogEntry.With(ctx, &err, observation.Args{LogFields: []otlog.Field{
		otlog.String("queueName", queueName),
		otlog.Int("jobID", job.ID),
		otlog.Int("entryID", entryID),
	}})
	defer endObservation(1, observation.Args{})

	req, err := c.client.NewJSONJobRequest(
		http.MethodPost,
		fmt.Sprintf("%s/updateExecutionLogEntry", queueName),
		job.Token,
		executor.UpdateExecutionLogEntryRequest{
			JobOperationRequest: executor.JobOperationRequest{
				ExecutorName: c.options.ExecutorName,
				JobID:        job.ID,
			},
			EntryID:           entryID,
			ExecutionLogEntry: entry,
		},
	)
	if err != nil {
		return err
	}

	return c.client.DoAndDrop(ctx, req)
}

// getQueue is for backwards compatible. Try to get the queue name from the job. If it is not there, fall back to the
// value set in the Client.options.
func (c *Client) getQueue(job executor.Job) string {
	if len(job.Queue) > 0 {
		return job.Queue
	}
	return c.client.Queue()
}
